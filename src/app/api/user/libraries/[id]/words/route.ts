import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUserLibraryWordsEnriched } from '@/lib/data';
import { handleCorsPreflightRequest, addCorsHeaders } from '@/lib/cors';

// OPTIONS: Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request);
}

// GET: Get words from library
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');

  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.id) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return addCorsHeaders(response, origin);
    }

    // Verify library ownership
    const library = await prisma.userLibrary.findUnique({
      where: { id },
    });

    if (!library) {
      const response = NextResponse.json({ error: 'Library not found' }, { status: 404 });
      return addCorsHeaders(response, origin);
    }

    if (library.userId !== session.id) {
      const response = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      return addCorsHeaders(response, origin);
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const groupIndex = searchParams.get('groupIndex');
    const groupSize = searchParams.get('groupSize');
    const includeDefinitions = searchParams.get('includeDefinitions') === 'true';

    let query: any = {
      where: { libraryId: id },
      orderBy: { sequence: 'asc' },
    };

    // Apply pagination if groupIndex and groupSize provided (and groupIndex >= 0)
    if (groupIndex !== null && groupSize !== null && parseInt(groupIndex) >= 0) {
      const skip = parseInt(groupIndex) * parseInt(groupSize);
      const take = parseInt(groupSize);
      query.skip = skip;
      query.take = take;
    }

    const words = await prisma.userLibraryWord.findMany(query);

    // If includeDefinitions, enrich with dictionary data
    if (includeDefinitions) {
      const enrichedWords = await getUserLibraryWordsEnriched(
        id,
        session.id,
        groupIndex !== null ? parseInt(groupIndex) : undefined,
        groupSize !== null ? parseInt(groupSize) : undefined
      );
      const response = NextResponse.json({ words: enrichedWords });
      return addCorsHeaders(response, origin);
    }

    const response = NextResponse.json({ words });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error fetching words:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch words' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}

// POST: Add new word to library
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');

  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.id) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return addCorsHeaders(response, origin);
    }

    // Verify library ownership
    const library = await prisma.userLibrary.findUnique({
      where: { id },
    });

    if (!library) {
      const response = NextResponse.json({ error: 'Library not found' }, { status: 404 });
      return addCorsHeaders(response, origin);
    }

    if (library.userId !== session.id) {
      const response = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      return addCorsHeaders(response, origin);
    }

    const body = await request.json();
    const { word } = body;

    if (!word || typeof word !== 'string') {
      const response = NextResponse.json({ error: 'Word is required' }, { status: 400 });
      return addCorsHeaders(response, origin);
    }

    const normalizedWord = word.trim().toLowerCase();

    // Validate word format
    if (!/^[a-z'-]+$/i.test(normalizedWord)) {
      const response = NextResponse.json(
        { error: 'Invalid word format' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Check if word already exists in library
    const existing = await prisma.userLibraryWord.findFirst({
      where: {
        libraryId: id,
        word: normalizedWord,
      },
    });

    if (existing) {
      const response = NextResponse.json(
        { error: 'Word already exists in library' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Get max sequence number
    const maxSequence = await prisma.userLibraryWord.findFirst({
      where: { libraryId: id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });

    const newSequence = (maxSequence?.sequence || 0) + 1;

    // Add word and update library word count
    const [newWord] = await prisma.$transaction([
      prisma.userLibraryWord.create({
        data: {
          id: crypto.randomUUID(),
          libraryId: id,
          word: normalizedWord,
          sequence: newSequence,
        },
      }),
      prisma.userLibrary.update({
        where: { id },
        data: { wordCount: { increment: 1 } },
      }),
    ]);

    const response = NextResponse.json({ word: newWord });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error adding word:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to add word' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}

// DELETE: Batch delete words
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin');

  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.id) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return addCorsHeaders(response, origin);
    }

    // Verify library ownership
    const library = await prisma.userLibrary.findUnique({
      where: { id },
    });

    if (!library) {
      const response = NextResponse.json({ error: 'Library not found' }, { status: 404 });
      return addCorsHeaders(response, origin);
    }

    if (library.userId !== session.id) {
      const response = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      return addCorsHeaders(response, origin);
    }

    const body = await request.json();
    const { wordIds } = body;

    if (!Array.isArray(wordIds) || wordIds.length === 0) {
      const response = NextResponse.json(
        { error: 'wordIds array is required' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Delete words and update library word count
    const deleteResult = await prisma.$transaction([
      prisma.userLibraryWord.deleteMany({
        where: {
          id: { in: wordIds },
          libraryId: id,
        },
      }),
      prisma.userLibrary.update({
        where: { id },
        data: { wordCount: { decrement: wordIds.length } },
      }),
    ]);

    const response = NextResponse.json({
      success: true,
      deletedCount: deleteResult[0].count,
    });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error deleting words:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to delete words' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}
