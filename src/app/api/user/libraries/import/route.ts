import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleCorsPreflightRequest, addCorsHeaders } from '@/lib/cors';

/**
 * OPTIONS /api/user/libraries/import
 *
 * Handle CORS preflight request
 */
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request);
}

/**
 * POST /api/user/libraries/import
 *
 * Import words from external platform
 *
 * Request body(两种皆可):
 *  - JSON: { "name": "Library Name", "description": "Optional", "words": ["word1", ...] }
 *  - multipart/form-data: file(CSV,每行取第一个像单词的列) + name + description
 *
 * Response:
 * {
 *   "success": true,
 *   "library": {
 *     "id": "uuid",
 *     "name": "Library Name",
 *     "wordCount": 100
 *   }
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

    // 同时支持 JSON({name, description, words[]})与 multipart 表单(file + name + description)
    const contentType = request.headers.get('content-type') || '';
    let name: unknown;
    let description: unknown;
    let words: unknown;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      name = form.get('name');
      description = form.get('description');
      const file = form.get('file');
      const text = file instanceof File ? await file.text() : '';
      // CSV 每行取第一个像单词的列(兼容 "序号,单词" 与纯单词两种格式)
      words = text
        .split(/\r?\n/)
        .map((line) =>
          line
            .split(',')
            .map((cell) => cell.trim())
            .find((cell) => /^[a-zA-Z][a-zA-Z'-]*$/.test(cell)),
        )
        .filter(Boolean);
    } else {
      const body = await request.json();
      name = body.name;
      description = body.description;
      words = body.words;
    }

    // Validate input
    if (!name || typeof name !== 'string') {
      const response = NextResponse.json(
        { error: 'Library name is required' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    if (!Array.isArray(words) || words.length === 0) {
      const response = NextResponse.json(
        { error: 'Words array is required and must not be empty' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    if (words.length > 10000) {
      const response = NextResponse.json(
        { error: 'Maximum 10,000 words per library' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

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

    // Normalize and validate words
    const normalizedWords: string[] = [];
    const seenWords = new Set<string>();

    for (const word of words) {
      if (typeof word !== 'string') {
        continue;
      }

      const normalized = word.trim().toLowerCase();

      // Validate word format (only letters, hyphens, apostrophes)
      if (!/^[a-z'-]+$/i.test(normalized)) {
        continue;
      }

      // Skip duplicates
      if (seenWords.has(normalized)) {
        continue;
      }

      seenWords.add(normalized);
      normalizedWords.push(normalized);
    }

    if (normalizedWords.length === 0) {
      const response = NextResponse.json(
        { error: 'No valid words found' },
        { status: 400 }
      );
      return addCorsHeaders(response, origin);
    }

    // Create library and words in a transaction
    const library = await prisma.userLibrary.create({
      data: {
        id: crypto.randomUUID(),
        userId: session.id,
        name: name.trim(),
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        wordCount: normalizedWords.length,
        updatedAt: new Date(),
        UserLibraryWord: {
          createMany: {
            data: normalizedWords.map((word, index) => ({
              id: crypto.randomUUID(),
              word,
              sequence: index + 1,
            })),
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        wordCount: true,
        createdAt: true,
      },
    });

    const response = NextResponse.json({
      success: true,
      library,
    });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error importing library:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to import library' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}
