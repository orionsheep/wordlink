import { NextRequest, NextResponse } from 'next/server';
import { getFissionData } from '@/lib/data';

const CACHE_HEADERS = {
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
};

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const word = searchParams.get('word');

    if (!word) {
        return new NextResponse('Missing word parameter', { status: 400 });
    }

    const data = await getFissionData(word);

    return NextResponse.json(data, { headers: CACHE_HEADERS });
}
