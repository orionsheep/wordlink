import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, isPro } from '@/lib/auth';
import {
    quotaExceededResponse,
    recordUsage,
    releaseQuotaReservation,
    reserveDailyQuota,
} from '@/lib/quota';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { completeDeepseek, LlmError } from '@/lib/ai/gateway';
import { cache, CACHE_KEYS } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const LEVELS = ['A2', 'B1', 'B2', 'C1'] as const;

const SEASON_HINT: Record<string, string> = {
    spring: 'spring rain, new leaves, birds returning',
    summer: 'summer dusk, fireflies, warm wind over a field',
    autumn: 'autumn woods, falling leaves, long amber light',
    winter: 'winter night, snow, a single warm window',
};

function extractJson(raw: string): { title: string; titleZh: string; paragraphs: Array<{ en: string; zh: string }> } | null {
    // 剥掉可能的 markdown 代码围栏
    const cleaned = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
        return null;
    }
}

/**
 * POST /api/ambient/articles/generate —— DeepSeek 一键生成沉浸式短文。
 * 输入主题/等级/季节/目标词汇，输出带中文对照的逐段短文并落库。
 * 这是「你学的词，变成你的故事」个性化闭环的核心接口。
 */
export async function POST(request: NextRequest) {
    try {
        // LLM 生成接口：先按 IP 限流，再要求登录（防止匿名刷 SiliconFlow 额度）
        const ipGate = rateLimit(`ambient-gen-ip:${clientIp(request)}`, 10, 60_000);
        if (!ipGate.ok) return tooManyRequests(ipGate.retryAfterSec);

        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userGate = rateLimit(`ambient-gen-user:${session.id}`, 6, 5 * 60_000);
        if (!userGate.ok) return tooManyRequests(userGate.retryAfterSec);

        // 付费墙：免费用户原子预占每日额度，Pro 不限
        let reservedQuotaId: string | null = null;
        if (!isPro(session)) {
            const reservation = await reserveDailyQuota(session.id, 'ambientGenerate');
            if (!reservation.allowed) return quotaExceededResponse(reservation, 'ambientGenerate');
            reservedQuotaId = reservation.usageLogId;
        }

        // 请求体字段：theme 文章主题（留空则随季节自选）、level CEFR 等级、season 季节、
        // targetWords 目标词汇（用用户最近学的词写故事，实现个性化闭环）。每个字段都可能是任意 JSON
        const body = await request.json().catch(() => null);
        const level = LEVELS.find((l) => l === body?.level) ?? 'B1';
        const season = typeof body?.season === 'string' && SEASON_HINT[body.season] ? body.season : undefined;
        const themeHint =
            (typeof body?.theme === 'string' ? body.theme.trim().slice(0, 120) : '') ||
            (season ? `a quiet scene of ${SEASON_HINT[season]}` : 'a small beautiful moment in everyday life');
        const words: string[] = Array.isArray(body?.targetWords)
            ? body.targetWords.filter((w: unknown): w is string => typeof w === 'string' && /^[a-zA-Z-]{1,40}$/.test(w)).slice(0, 10)
            : [];

        const wordInstruction =
            words.length > 0
                ? `\nIMPORTANT: Weave these vocabulary words naturally into the story (use each at least once, any grammatical form): ${words.join(', ')}. The story must feel organic, not like an exercise.`
                : '';

        const prompt = `You are a writer of tiny, cinematic English stories for language learners.

Write a short English reading piece:
- Theme: ${themeHint}${wordInstruction}
- CEFR level: ${level} (vocabulary and grammar must match this level)
- Length: 90–120 words total, divided into 4–6 short paragraphs (each paragraph is 1–2 sentences)
- Style: calm, poetic, concrete imagery. No clichés. No dialogue tags like "he said". Every sentence should be easy to read aloud slowly.
- Also provide a natural Chinese translation for each paragraph and a Chinese title.

Respond with ONLY valid JSON in exactly this shape (no markdown fences, no commentary):
{
  "title": "English Title",
  "titleZh": "中文标题",
  "paragraphs": [
    { "en": "...", "zh": "..." },
    { "en": "...", "zh": "..." }
  ]
}`;

        let raw: string;
        try {
            raw = await completeDeepseek([{ role: 'user', content: prompt }], {
                model: process.env.LLM_MODEL_FAST || process.env.LLM_MODEL,
                temperature: 1.1,
                maxTokens: 1200,
            });
        } catch (e) {
            await releaseQuotaReservation(reservedQuotaId);
            console.error('[ambient/generate] LLM request failed:', e);
            const status = e instanceof LlmError ? e.status : 0;
            return NextResponse.json({ error: status ? `LLM request failed (${status})` : 'LLM request failed' }, { status: 502 });
        }
        // 上游已返回内容，本次生成已发生计费，不再释放预占额度（即使后续解析失败也不重复刷上游）
        const quotaAlreadyRecorded = reservedQuotaId !== null;
        const parsed = extractJson(raw);

        if (typeof parsed?.title !== 'string' || !parsed.title.trim() || !Array.isArray(parsed.paragraphs)) {
            return NextResponse.json({ error: 'LLM returned malformed article' }, { status: 502 });
        }

        const paragraphs = parsed.paragraphs
            .filter((p) => typeof p?.en === 'string' && p.en.trim())
            .map((p) => ({ en: p.en.trim(), zh: typeof p.zh === 'string' ? p.zh.trim() : undefined }));

        if (paragraphs.length < 3) {
            return NextResponse.json({ error: 'Article too short after parsing' }, { status: 502 });
        }

        const wordCount = paragraphs.reduce((acc, p) => acc + p.en.split(/\s+/).length, 0);

        const created = await prisma.ambientArticle.create({
            data: {
                title: parsed.title.trim().slice(0, 200),
                titleZh: typeof parsed.titleZh === 'string' ? parsed.titleZh.trim().slice(0, 200) : null,
                level,
                season: season ?? null,
                source: 'ai',
                userId: session.id, // 只出现在生成者自己的列表里
                paragraphs,
                wordCount,
            },
        });

        if (!quotaAlreadyRecorded) {
            await recordUsage(session.id, 'ambientGenerate');
        }
        // /read 的推荐列表按用户缓存 60s，清掉才能马上看到新文章
        await cache.delete(CACHE_KEYS.scoredArticles(session.id));

        return NextResponse.json({
            id: created.id,
            title: created.title,
            titleZh: created.titleZh,
            level: created.level,
            season: created.season,
            source: created.source,
            paragraphs: created.paragraphs,
            wordCount: created.wordCount,
        });
    } catch (error) {
        console.error('Failed to generate ambient article:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
