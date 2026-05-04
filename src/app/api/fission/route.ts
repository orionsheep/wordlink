import { NextRequest, NextResponse } from 'next/server';
import { getFissionData } from '@/lib/data';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const word = searchParams.get('word');

    if (!word) {
        return new NextResponse('Missing word parameter', { status: 400 });
    }

    const data = await getFissionData(word);

    return NextResponse.json(data);
}
