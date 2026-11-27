import { NextResponse } from 'next/server';
import { getQuizDataForWords } from '@/lib/data';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const words = body?.words;
        if (!Array.isArray(words) || !words.every((w): w is string => typeof w === 'string')) {
            return NextResponse.json({ error: 'Words must be an array of strings' }, { status: 400 });
        }

        const sanitized = words
            .map((w) => w.trim())
            .filter((w) => w.length > 0 && w.length <= 200)
            .slice(0, 100);

        // 长度上限：防止超大数组逐词查询拖垮数据库
        const data = await getQuizDataForWords(sanitized);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Quiz data error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
