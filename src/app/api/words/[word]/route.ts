import { NextRequest, NextResponse } from 'next/server';
import { getWordDetails, getEnrichedWordData } from '@/lib/data';
import { cache } from '@/lib/cache';

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ word: string }> }
) {
    const params = await props.params;
    const word = params.word;
    const cacheKey = `api:word:${word}`;

    const cached = await cache.get<{ content: string | null; chinese: any }>(cacheKey);
    if (cached) {
        return NextResponse.json(cached);
    }

    const [content, chinese] = await Promise.all([
        getWordDetails(word),
        getEnrichedWordData(word),
    ]);

    if (!content && !chinese) {
        return new NextResponse('Word not found', { status: 404 });
    }

    const result = { content, chinese };
    await cache.set(cacheKey, result);
    return NextResponse.json(result);
}
