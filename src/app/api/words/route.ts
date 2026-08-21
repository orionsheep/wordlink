import { NextRequest, NextResponse } from 'next/server';
import { getWordList } from '@/lib/data';

const CACHE_HEADERS = {
    'Cache-Control': 'public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800',
};

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const includeDefinitions = searchParams.get('includeDefinitions') === 'true';

    const words = await getWordList(query);

    if (includeDefinitions) {
        const { getQuizDataForWords } = await import('@/lib/data');
        const detailedWords = await getQuizDataForWords(words);
        return NextResponse.json(detailedWords, { headers: CACHE_HEADERS });
    }

    return NextResponse.json(words, { headers: CACHE_HEADERS });
}
