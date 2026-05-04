import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Papa from 'papaparse';
import { handleCorsPreflightRequest, addCorsHeaders } from '@/lib/cors';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_WORDS_PER_LIBRARY = 10000;
const MAX_LIBRARIES_PER_USER = 50;

// OPTIONS: Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request);
}

// GET: Get all user libraries
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');

  try {
    const session = await getSession();
    if (!session?.id) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return addCorsHeaders(response, origin);
    }

    const libraries = await prisma.userLibrary.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        wordCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const response = NextResponse.json({ libraries });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error fetching libraries:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch libraries' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}

// POST: Upload CSV and create new library
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  try {
    const session = await getSession();
    if (!session?.id) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return addCorsHeaders(response, origin);
    }

    // Check library count limit
    const libraryCount = await prisma.userLibrary.count({
      where: { userId: session.id },
    });
    if (libraryCount >= MAX_LIBRARIES_PER_USER) {
      const response = NextResponse.json(
        { error: `Maximum ${MAX_LIBRARIES_PER_USER} libraries allowed per user` },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string | null;

    if (!file || !name) {
      const response = NextResponse.json(
        { error: 'File and name are required' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Validate file type
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      const response = NextResponse.json(
        { error: 'Only CSV files are allowed' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const response = NextResponse.json(
        { error: 'File size must be less than 5MB' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Read and parse CSV
    const text = await file.text();
    const parseResult = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      const response = NextResponse.json(
        { error: 'Failed to parse CSV file', details: parseResult.errors },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Extract words from CSV
    const rows = parseResult.data as any[];
    const words: { word: string; sequence: number }[] = [];
    const seenWords = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Support both Chinese and English column names
      const word = (row['单词'] || row['word'] || row['Word'] || '').trim().toLowerCase();

      if (!word) continue;

      // Validate word format (English letters, hyphens, apostrophes)
      if (!/^[a-z'-]+$/i.test(word)) {
        const response = NextResponse.json(
          { error: `Invalid word format at row ${i + 1}: "${word}"` },
          { status: 400 }
        );
        return addCorsHeaders(response, origin);
      }

      // Deduplicate
      if (seenWords.has(word)) continue;
      seenWords.add(word);

      words.push({
        word,
        sequence: words.length + 1,
      });

      // Check word count limit
      if (words.length >= MAX_WORDS_PER_LIBRARY) {
        break;
      }
    }

    if (words.length === 0) {
      const response = NextResponse.json(
        { error: 'No valid words found in CSV file' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Create library and words in transaction
    const library = await prisma.$transaction(async (tx) => {
      const newLibrary = await tx.userLibrary.create({
        data: {
          id: crypto.randomUUID(),
          userId: session.id,
          name,
          description,
          wordCount: words.length,
          updatedAt: new Date(),
        },
      });

      await tx.userLibraryWord.createMany({
        data: words.map((w) => ({
          id: crypto.randomUUID(),
          libraryId: newLibrary.id,
          word: w.word,
          sequence: w.sequence,
        })),
      });

      return newLibrary;
    });

    const response = NextResponse.json({
      success: true,
      library: {
        id: library.id,
        name: library.name,
        description: library.description,
        wordCount: library.wordCount,
        createdAt: library.createdAt,
      },
    });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error creating library:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to create library' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}
