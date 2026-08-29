import { NextResponse, NextRequest } from 'next/server';
import { getLibraryList } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const pathParam = searchParams.get('path') || '';
    const flat = searchParams.get('flat') === 'true';

    // Helper to recursively get all library files
    async function getFlatLibraries(rel = ''): Promise<any[]> {
        const items = await getLibraryList(rel);
        const result: any[] = [];
        for (const item of items) {
            if (item.type === 'directory') {
                const sub = await getFlatLibraries(item.path);
                result.push(...sub);
            } else {
                result.push(item);
            }
        }
        return result;
    }

    // Get system libraries (flat or single level)
    const systemLibraries = flat
        ? await getFlatLibraries(pathParam)
        : await getLibraryList(pathParam);

    // Get user libraries if authenticated (with error handling)
    let userLibraries: any[] = [];

    try {
        const session = await getSession();
        if (session?.id) {
            const libraries = await prisma.userLibrary.findMany({
                where: { userId: session.id },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    wordCount: true,
                },
            });

            userLibraries = libraries.map((lib) => ({
                name: lib.name,
                type: 'file' as const,
                path: `user:${lib.id}`,
                source: 'user' as const,
                libraryId: lib.id,
                wordCount: lib.wordCount,
            }));
        }
    } catch (error) {
        console.error('Error fetching user libraries:', error);
        // Continue without user libraries if database fails
    }

    // Combine system and user libraries
    return NextResponse.json([...systemLibraries, ...userLibraries]);
}
