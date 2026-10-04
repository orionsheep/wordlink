import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getLibraryList } from '@/lib/data';
import { getSession } from '@/lib/auth';
import { hasAuthCookie } from '@/lib/supabase/token';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const pathParam = searchParams.get('path') || '';
    const flat = searchParams.get('flat') === 'true';

    // Helper to recursively get all library files (directories scanned in parallel)
    async function getFlatLibraries(rel = ''): Promise<any[]> {
        const items = await getLibraryList(rel);
        const groups = await Promise.all(items.map((item) =>
            item.type === 'directory' ? getFlatLibraries(item.path) : Promise.resolve([item])
        ));
        return groups.flat();
    }

    // Get system libraries (flat or single level)
    const systemLibraries = flat
        ? await getFlatLibraries(pathParam)
        : await getLibraryList(pathParam);

    // Get user libraries if authenticated (with error handling)
    let userLibraries: any[] = [];

    try {
        // 无 Supabase auth cookie 的访客跳过 getSession，省一次远程往返；
        // DEMO_MODE 下无 cookie 也有会话，不能跳过
        const cookieStore = await cookies();
        const session = (process.env.DEMO_MODE === 'true' || hasAuthCookie(cookieStore.getAll()))
            ? await getSession()
            : null;
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
