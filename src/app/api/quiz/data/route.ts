import { NextResponse } from 'next/server';
import { getQuizDataForWords } from '@/lib/data';

export async function POST(request: Request) {
    try {
        const { words } = await request.json();
        if (!Array.isArray(words)) {
            return NextResponse.json({ error: 'Words must be an array' }, { status: 400 });
        }

        // 长度上限：防止超大数组逐词查询拖垮数据库
        const data = await getQuizDataForWords(words.slice(0, 100));
        return NextResponse.json(data);
    } catch (error) {
        console.error('Quiz data error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
