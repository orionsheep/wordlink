import { NextRequest, NextResponse } from 'next/server';
import { ensureLocalUser, getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureLocalUser(session);

    const { language } = await request.json();

    if (!language || !['zh', 'en'].includes(language)) {
      return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
    }

    // Update user's preferred language in database
    await prisma.user.update({
      where: { id: session.id },
      data: { preferredLanguage: language }
    });

    // Set cookie for immediate effect
    const response = NextResponse.json({ success: true });
    response.cookies.set('NEXT_LOCALE', language, {
      path: '/',
      maxAge: 31536000, // 1 year
    });

    return response;
  } catch (error) {
    console.error('Error updating language preference:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureLocalUser(session);

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { preferredLanguage: true }
    });

    return NextResponse.json({ language: user?.preferredLanguage || 'zh' });
  } catch (error) {
    console.error('Error fetching language preference:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
