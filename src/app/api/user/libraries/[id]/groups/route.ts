import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleCorsPreflightRequest, addCorsHeaders } from '@/lib/cors';

// OPTIONS: Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request);
}

// GET: Get library groups (for quiz selection)
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
      where: { id: id },
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
    const groupSize = parseInt(searchParams.get('groupSize') || '100');

    // Get total word count
    const totalWords = library.wordCount;
    const totalGroups = Math.ceil(totalWords / groupSize);

    // Generate group info
    const groups = [];
    for (let i = 0; i < totalGroups; i++) {
      const startIndex = i * groupSize;
      const endIndex = Math.min(startIndex + groupSize, totalWords);
      groups.push({
        index: i,
        name: `Group ${i + 1} (${startIndex + 1}-${endIndex})`,
        wordCount: endIndex - startIndex,
      });
    }

    const response = NextResponse.json({ groups });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error fetching groups:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}
