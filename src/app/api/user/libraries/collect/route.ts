import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleCorsPreflightRequest, addCorsHeaders } from '@/lib/cors';

/**
 * OPTIONS /api/user/libraries/collect
 *
 * Handle CORS preflight request
 */
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request);
}

/**
 * POST /api/user/libraries/collect
 *
 * Collect a single word to a library (creates library if not exists)
 *
 * Request body:
 * {
 *   "word": "example",
 *   "libraryName": "阅读收集" (optional, defaults to "我的收集")
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "word": { ... },
 *   "library": { ... },
 *   "isNewLibrary": false,
 *   "isNewWord": true
 * }
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  try {
    const session = await getSession();
    if (!session?.id) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return addCorsHeaders(response, origin);
    }

    const body = await request.json();
    const { word, libraryName = '我的收集' } = body;

    // Validate word
    if (!word || typeof word !== 'string') {
      const response = NextResponse.json(
        { error: 'Word is required' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    const normalizedWord = word.trim().toLowerCase();

    // Validate word format
    if (!/^[a-z'-]+$/i.test(normalizedWord)) {
      const response = NextResponse.json(
        { error: 'Invalid word format. Only letters, hyphens, and apostrophes are allowed.' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Find or create library
    let library = await prisma.userLibrary.findFirst({
      where: {
        userId: session.id,
        name: libraryName.trim(),
      },
    });

    const isNewLibrary = !library;

    if (!library) {
      // Check user library limit
      const libraryCount = await prisma.userLibrary.count({
        where: { userId: session.id },
      });

      if (libraryCount >= 50) {
        const response = NextResponse.json(
          { error: 'Maximum 50 libraries per user' },
          { status: 400 }
        );
        return addCorsHeaders(response, origin);
      }

      // Create new library
      library = await prisma.userLibrary.create({
        data: {
          id: crypto.randomUUID(),
          userId: session.id,
          name: libraryName.trim(),
          description: '从阅读平台收集',
          wordCount: 0,
          updatedAt: new Date(),
        },
      });
    }

    // Check if word already exists in library
    const existingWord = await prisma.userLibraryWord.findFirst({
      where: {
        libraryId: library.id,
        word: normalizedWord,
      },
    });

    if (existingWord) {
      const response = NextResponse.json({
        success: true,
        word: existingWord,
        library: {
          id: library.id,
          name: library.name,
          wordCount: library.wordCount,
        },
        isNewLibrary,
        isNewWord: false,
        message: 'Word already exists in library',
      });
      return addCorsHeaders(response, origin);
    }

    // Check library word limit
    if (library.wordCount >= 10000) {
      const response = NextResponse.json(
        { error: 'Maximum 10,000 words per library' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Get max sequence number
    const maxSequence = await prisma.userLibraryWord.findFirst({
      where: { libraryId: library.id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });

    const newSequence = (maxSequence?.sequence || 0) + 1;

    // Add word and update library word count in transaction
    const [newWord, updatedLibrary] = await prisma.$transaction([
      prisma.userLibraryWord.create({
        data: {
          id: crypto.randomUUID(),
          libraryId: library.id,
          word: normalizedWord,
          sequence: newSequence,
        },
      }),
      prisma.userLibrary.update({
        where: { id: library.id },
        data: { wordCount: { increment: 1 } },
      }),
    ]);

    const response = NextResponse.json({
      success: true,
      word: newWord,
      library: {
        id: updatedLibrary.id,
        name: updatedLibrary.name,
        wordCount: updatedLibrary.wordCount,
      },
      isNewLibrary,
      isNewWord: true,
      message: 'Word collected successfully',
    });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error collecting word:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to collect word' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}
