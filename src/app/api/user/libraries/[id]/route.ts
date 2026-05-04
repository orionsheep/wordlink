import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleCorsPreflightRequest, addCorsHeaders } from '@/lib/cors';

// OPTIONS: Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request);
}

// GET: Get library details
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

    const library = await prisma.userLibrary.findUnique({
      where: { id: id },
      include: {
        _count: {
          select: { UserLibraryWord: true },
        },
      },
    });

    if (!library) {
      const response = NextResponse.json({ error: 'Library not found' }, { status: 404 });
      return addCorsHeaders(response, origin);
    }

    // Verify ownership
    if (library.userId !== session.id) {
      const response = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      return addCorsHeaders(response, origin);
    }

    const response = NextResponse.json({ library });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error fetching library:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch library' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}

// PATCH: Update library info
export async function PATCH(
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

    const body = await request.json();
    const { name, description } = body;

    const updated = await prisma.userLibrary.update({
      where: { id: id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
      },
    });

    const response = NextResponse.json({ library: updated });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error updating library:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to update library' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}

// DELETE: Delete library
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

    // Delete library (cascade will delete words)
    await prisma.userLibrary.delete({
      where: { id: id },
    });

    const response = NextResponse.json({ success: true });
    return addCorsHeaders(response, origin);
  } catch (error) {
    console.error('Error deleting library:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to delete library' },
      { status: 500 }
    );
    return addCorsHeaders(errorResponse, origin);
  }
}
