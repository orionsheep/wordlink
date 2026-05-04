import { NextResponse } from 'next/server';
import { getQuizWords } from '@/lib/data';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const count = parseInt(searchParams.get('count') || '10');

    const words = await getQuizWords(count);
    return NextResponse.json(words);
}
