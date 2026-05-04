import { NextRequest, NextResponse } from 'next/server';
import { getLibraryWords } from '@/lib/data';

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ name: string }> }
) {
    const params = await props.params;
    const name = params.name;
    // Decode URI component in case of Chinese characters
    const decodedName = decodeURIComponent(name);

    const words = await getLibraryWords(decodedName);
    return NextResponse.json(words);
}
