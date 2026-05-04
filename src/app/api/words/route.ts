import { NextRequest, NextResponse } from 'next/server';
import { getWordList } from '@/lib/data';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const includeDefinitions = searchParams.get('includeDefinitions') === 'true';

    const words = await getWordList(query);

    if (includeDefinitions) {
        const { getQuizDataForWords } = await import('@/lib/data');
        const detailedWords = await getQuizDataForWords(words);
        return NextResponse.json(detailedWords);
    }

    return NextResponse.json(words);
}
