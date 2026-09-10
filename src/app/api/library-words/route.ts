import { NextRequest, NextResponse } from 'next/server';
import { getLibraryWords, getQuizDataForWords } from '@/lib/data';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const pathParam = searchParams.get('path');

    if (!pathParam) {
        return new NextResponse('Path parameter is required', { status: 400 });
    }

    // 用户私有词库：仅属主或公开词库可读
    if (pathParam.startsWith('user:')) {
        const libraryId = pathParam.slice('user:'.length);
        const library = await prisma.userLibrary.findUnique({
            where: { id: libraryId },
            select: { userId: true, isPublic: true },
        });
        if (!library) {
            return NextResponse.json({ error: 'Library not found' }, { status: 404 });
        }
        if (!library.isPublic) {
            const session = await getSession();
            if (!session || session.id !== library.userId) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }
    }

    const groupIndexParam = searchParams.get('groupIndex');
    const groupSizeParam = searchParams.get('groupSize');
    const includeDefinitions = searchParams.get('includeDefinitions') === 'true';

    let words = await getLibraryWords(pathParam);

    if (groupIndexParam !== null) {
        const groupIndex = parseInt(groupIndexParam);
        // If index is -1, return all words (no slicing)
        if (groupIndex !== -1) {
            const groupSize = groupSizeParam ? parseInt(groupSizeParam) : 100;
            const start = groupIndex * groupSize;
            words = words.slice(start, start + groupSize);
        }
    }

    if (includeDefinitions) {
        const wordsWithData = await getQuizDataForWords(words);
        return NextResponse.json(wordsWithData);
    }

    return NextResponse.json(words);
}
