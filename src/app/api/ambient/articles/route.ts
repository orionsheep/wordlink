import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CURATED_ARTICLES } from '@/lib/ambient-articles-seed';

export const dynamic = 'force-dynamic';

/** 统计英文词数 */
function countWords(paragraphs: Array<{ en: string }>): number {
    return paragraphs.reduce((acc, p) => acc + p.en.trim().split(/\s+/).length, 0);
}

/**
 * GET /api/ambient/articles —— 沉浸式阅读文章列表。
 * 首次访问时自动播种 4 篇精选短文（零外部依赖，演示自愈）。
 */
export async function GET() {
    try {
        let articles = await prisma.ambientArticle.findMany({
            orderBy: { createdAt: 'desc' },
        });

        // 自愈播种：库空则写入精选内容
        if (articles.length === 0) {
            await prisma.ambientArticle.createMany({
                data: CURATED_ARTICLES.map((a) => ({
                    title: a.title,
                    titleZh: a.titleZh,
                    level: a.level,
                    season: a.season,
                    source: 'curated',
                    paragraphs: JSON.parse(JSON.stringify(a.paragraphs)),
                    wordCount: countWords(a.paragraphs),
                })),
            });
            articles = await prisma.ambientArticle.findMany({
                orderBy: { createdAt: 'desc' },
            });
        }

        return NextResponse.json(
            articles.map((a) => ({
                id: a.id,
                title: a.title,
                titleZh: a.titleZh,
                level: a.level,
                season: a.season,
                source: a.source,
                paragraphs: a.paragraphs,
                wordCount: a.wordCount,
                createdAt: a.createdAt,
            })),
        );
    } catch (error) {
        console.error('Failed to list ambient articles:', error);
        // 数据库不可用时兜底返回内存精选内容，保证屏保功能永不中断
        return NextResponse.json(
            CURATED_ARTICLES.map((a, i) => ({
                id: `fallback-${i}`,
                title: a.title,
                titleZh: a.titleZh,
                level: a.level,
                season: a.season,
                source: 'curated',
                paragraphs: a.paragraphs,
                wordCount: countWords(a.paragraphs),
            })),
        );
    }
}
