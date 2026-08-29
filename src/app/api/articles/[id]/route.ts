import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CURATED_ARTICLES } from '@/lib/ambient-articles-seed';

export const dynamic = 'force-dynamic';

/**
 * GET /api/articles/[id] —— 文章详情与段落音视频数据接口。
 * 1. 若 id 以 'echo-' 开头，代理请求 EchoStream FastAPI 获取 paragraphs 与 audio_sentences；
 * 2. 否则从本地 Prisma AmbientArticle 读取；
 * 3. 若无匹配从种子库兜底。
 */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;

    // 1. EchoStream 远程文章代理
    if (id.startsWith('echo-')) {
        const rawId = id.replace(/^echo-/, '');
        const fastApiUrl = process.env.FASTAPI_INTERNAL_URL || 'http://localhost:8000';
        try {
            const [contentRes, paraRes] = await Promise.all([
                fetch(`${fastApiUrl}/api/v1/contents/${rawId}`),
                fetch(`${fastApiUrl}/api/v1/contents/${rawId}/paragraphs`),
            ]);

            if (contentRes.ok && paraRes.ok) {
                const content = await contentRes.json();
                const paragraphs = await paraRes.json();

                return NextResponse.json({
                    id,
                    title: content.title,
                    titleZh: content.description || null,
                    level: content.difficulty === 'beginner' ? 'A2' : content.difficulty === 'advanced' ? 'C1' : 'B1',
                    category: content.category || '外刊精读',
                    source: 'echostream',
                    paragraphs: Array.isArray(paragraphs) ? paragraphs : [],
                    wordCount: Array.isArray(paragraphs)
                        ? (paragraphs as Array<{ text_en?: string }>).reduce((acc: number, p) => acc + (p.text_en || '').split(/\s+/).length, 0)
                        : 120,
                });
            }
        } catch (err) {
            console.warn('FastAPI proxy failed for article', id, err);
        }
    }

    // 2. 本地数据库查询
    try {
        const article = await prisma.ambientArticle.findUnique({
            where: { id },
        });

        if (article) {
            const rawPara = Array.isArray(article.paragraphs) ? (article.paragraphs as Array<Record<string, unknown>>) : [];
            const paragraphs = rawPara.map((p, pIdx) => ({
                paragraphIndex: pIdx,
                text_en: String(p.en || p.text_en || ''),
                text_zh: String(p.zh || p.text_zh || ''),
                audio_url: (p.audioUrl || p.audio_url) ? String(p.audioUrl || p.audio_url) : undefined,
            }));

            return NextResponse.json({
                id: article.id,
                title: article.title,
                titleZh: article.titleZh,
                level: article.level,
                season: article.season,
                source: article.source,
                paragraphs,
                wordCount: article.wordCount,
                createdAt: article.createdAt,
            });
        }
    } catch (err) {
        console.error('Error fetching local article:', err);
    }

    // 3. 内存种子兜底
    const seed = CURATED_ARTICLES.find((a) => a.title.toLowerCase().includes(id.toLowerCase())) || CURATED_ARTICLES[0];
    return NextResponse.json({
        id: `seed-0`,
        title: seed.title,
        titleZh: seed.titleZh,
        level: seed.level,
        season: seed.season,
        source: 'curated',
        paragraphs: seed.paragraphs.map((p, pIdx) => ({
            paragraphIndex: pIdx,
            text_en: p.en,
            text_zh: p.zh,
        })),
        wordCount: seed.paragraphs.reduce((acc, p) => acc + p.en.split(/\s+/).length, 0),
    });
}
