import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CURATED_ARTICLES } from '@/lib/ambient-articles-seed';
import { scoreArticleWithRmeV5, type ArticleCandidate, type UserLearningProfile } from '@/lib/reader-engine/recommender';

export const dynamic = 'force-dynamic';

function countWords(paragraphs: Array<{ en?: string; text_en?: string }>): number {
    return paragraphs.reduce((acc, p) => {
        const text = (p.en || p.text_en || '').trim();
        return acc + (text ? text.split(/\s+/).length : 0);
    }, 0);
}

/** 提取文本中的所有纯字母单词（转为小写） */
function extractWords(paragraphs: Array<{ text_en?: string; en?: string }>): string[] {
    const raw = paragraphs.map(p => p.text_en || p.en || '').join(' ');
    const tokens = raw.toLowerCase().match(/[a-z]{3,}/g) || [];
    return Array.from(new Set(tokens));
}

/**
 * GET /api/articles —— 全域语境长文列表接口 (集成 RME-V5 6维推荐算法)。
 *
 * 核心升级：
 * 1. 从 Prisma 读取 AmbientArticle 库；
 * 2. 获取用户真实到期复习词与错词（UserWordState & QuizRecord）；
 * 3. 运行 RME-V5 排序器，计算每篇文章的复习命中率与推荐分；
 * 4. 按 recommendationScore 降序排列，实现「下一篇文章，就是你的单词复习」。
 */
export async function GET() {
    try {
        let localArticles = await prisma.ambientArticle.findMany({
            orderBy: { createdAt: 'desc' },
        });

        // 库空自愈播种
        if (localArticles.length === 0) {
            await prisma.ambientArticle.createMany({
                data: CURATED_ARTICLES.map((a) => ({
                    title: a.title,
                    titleZh: a.titleZh,
                    level: a.level,
                    season: a.season,
                    source: 'curated',
                    paragraphs: JSON.parse(JSON.stringify(a.paragraphs)),
                    wordCount: a.paragraphs.reduce((acc, p) => acc + p.en.split(/\s+/).length, 0),
                })),
            });
            localArticles = await prisma.ambientArticle.findMany({
                orderBy: { createdAt: 'desc' },
            });
        }

        // 尝试从 UserWordState 或 QuizRecord 获取待复习词
        let dueWords: string[] = [];
        try {
            const now = new Date();
            const weakStates = await prisma.userWordState.findMany({
                where: {
                    OR: [
                        { nextReviewAt: { lte: now } },
                        { stage: { in: ['UNFAMILIAR', 'FAMILIAR'] } },
                    ],
                },
                take: 20,
                orderBy: { nextReviewAt: 'asc' },
            });
            dueWords = weakStates.map(s => s.word.toLowerCase());

            if (dueWords.length === 0) {
                // 回退：从近期错题记录拉取
                const wrongRecords = await prisma.quizRecord.findMany({
                    where: { isCorrect: false },
                    take: 15,
                    orderBy: { timestamp: 'desc' },
                });
                dueWords = Array.from(new Set(wrongRecords.map(r => r.word.toLowerCase())));
            }
        } catch {
            /* 离线或新用户降级 */
        }

        // 如果仍无数据，使用意境高频核心词作为默认推荐目标
        if (dueWords.length === 0) {
            dueWords = ['rain', 'light', 'leaf', 'serendipity', 'luminous', 'window', 'quiet', 'stone', 'branch', 'morning', 'sky', 'breeze'];
        }

        const userProfile: UserLearningProfile = {
            userCefr: 'B1',
            targetExam: 'CET4',
            dueWords,
            preferredTopics: ['nature', 'forest', 'spring', 'autumn'],
        };

        const normalizedLocal = localArticles.map((a) => {
            const rawPara = Array.isArray(a.paragraphs) ? (a.paragraphs as Array<Record<string, unknown>>) : [];
            const paragraphs = rawPara.map((p, pIdx) => ({
                paragraphIndex: pIdx,
                text_en: String(p.en || p.text_en || ''),
                text_zh: String(p.zh || p.text_zh || ''),
                audio_url: (p.audioUrl || p.audio_url) ? String(p.audioUrl || p.audio_url) : undefined,
            }));
            const wordCount = a.wordCount || countWords(paragraphs);
            const containedWords = extractWords(paragraphs);

            const candidate: ArticleCandidate = {
                id: a.id,
                title: a.title,
                titleZh: a.titleZh || undefined,
                season: a.season || undefined,
                level: a.level || 'B1',
                wordCount,
                containedWords,
            };

            const rme = scoreArticleWithRmeV5(candidate, userProfile);

            return {
                id: a.id,
                title: a.title,
                titleZh: a.titleZh,
                level: a.level,
                season: a.season,
                source: a.source || 'curated',
                paragraphs,
                wordCount,
                createdAt: a.createdAt,
                recommendationScore: rme.totalScore,
                matchedDueWords: rme.matchedDueWords,
                recommendationReason: rme.recommendationReason,
            };
        });

        // 尝试合并 EchoStream FastAPI 媒体库
        const fastApiUrl = process.env.FASTAPI_INTERNAL_URL || 'http://localhost:8000';
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 1200);
            const remoteRes = await fetch(`${fastApiUrl}/api/v1/contents?content_type=article&publish_status=published`, {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (remoteRes.ok) {
                const remoteData = await remoteRes.json();
                if (Array.isArray(remoteData)) {
                    const normalizedRemote = (remoteData as Array<Record<string, unknown>>).map((item) => ({
                        id: `echo-${item.id}`,
                        title: String(item.title || ''),
                        titleZh: item.description ? String(item.description) : null,
                        level: item.difficulty === 'beginner' ? 'A2' : item.difficulty === 'advanced' ? 'C1' : 'B1',
                        category: String(item.category || '外刊精读'),
                        source: 'echostream',
                        paragraphs: [],
                        wordCount: 150,
                        createdAt: item.created_at ? new Date(String(item.created_at)) : new Date(),
                        recommendationScore: 75,
                        matchedDueWords: [],
                        recommendationReason: '来自 EchoStream 的原声双语精读',
                    }));
                    const combined = [...normalizedLocal, ...normalizedRemote];
                    combined.sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0));
                    return NextResponse.json(combined);
                }
            }
        } catch {
            // FastAPI 离线，静默降级为本地全集
        }

        normalizedLocal.sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0));
        return NextResponse.json(normalizedLocal);
    } catch (error) {
        console.error('Failed to list articles:', error);
        return NextResponse.json(
            CURATED_ARTICLES.map((a, i) => ({
                id: `seed-${i}`,
                title: a.title,
                titleZh: a.titleZh,
                level: a.level,
                season: a.season,
                source: 'curated',
                paragraphs: a.paragraphs.map((p, pIdx) => ({
                    paragraphIndex: pIdx,
                    text_en: p.en,
                    text_zh: p.zh,
                })),
                wordCount: a.paragraphs.reduce((acc, p) => acc + p.en.split(/\s+/).length, 0),
                recommendationScore: 88,
                matchedDueWords: ['rain', 'light', 'leaf'],
                recommendationReason: '精选四季语境听读',
            })),
        );
    }
}
