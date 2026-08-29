import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface GenerateRequest {
    /** 文章主题（如 "a quiet library", "the last train home"），留空则随季节自选 */
    theme?: string;
    level?: 'A2' | 'B1' | 'B2' | 'C1';
    season?: string;
    /** 目标词汇（可选）：用用户最近学的词写故事，实现个性化闭环 */
    targetWords?: string[];
}

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
        const body: GenerateRequest = await request.json();
        const level = body.level || 'B1';
        const season = body.season && SEASON_HINT[body.season] ? body.season : undefined;
        const themeHint =
            body.theme?.trim() ||
            (season ? `a quiet scene of ${SEASON_HINT[season]}` : 'a small beautiful moment in everyday life');
        const words = (body.targetWords || []).filter((w) => /^[a-zA-Z-]+$/.test(w)).slice(0, 10);

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

        const llmRes = await fetch(
            `${process.env.LLM_BASE_URL || 'https://api.siliconflow.cn/v1'}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.SILICONFLOW_APIKEY || process.env.DEEPSEEK_APIKEY}`,
                },
                body: JSON.stringify({
                    model: process.env.LLM_MODEL_FAST || process.env.LLM_MODEL || 'deepseek-ai/DeepSeek-V3.2',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 1.1,
                }),
            },
        );

        if (!llmRes.ok) {
            const detail = await llmRes.text().catch(() => '');
            return NextResponse.json(
                { error: `LLM request failed (${llmRes.status})`, detail: detail.slice(0, 300) },
                { status: 502 },
            );
        }

        const payload = await llmRes.json();
        const raw: string = payload?.choices?.[0]?.message?.content ?? '';
        const parsed = extractJson(raw);

        if (!parsed?.title || !Array.isArray(parsed.paragraphs) || parsed.paragraphs.length < 3) {
            return NextResponse.json({ error: 'LLM returned malformed article', raw: raw.slice(0, 500) }, { status: 502 });
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
                titleZh: parsed.titleZh?.trim().slice(0, 200) ?? null,
                level,
                season: season ?? null,
                source: 'ai',
                paragraphs,
                wordCount,
            },
        });

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
