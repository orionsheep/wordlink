import { NextResponse } from 'next/server';
import { getQuizDataForWords } from '@/lib/data';

export async function POST(request: Request) {
    try {
        const { words } = await request.json();
        if (!Array.isArray(words)) {
            return NextResponse.json({ error: 'Words must be an array' }, { status: 400 });
        }

        const data = await getQuizDataForWords(words);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Quiz data error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
