import { NextResponse } from 'next/server';

const DEFAULT_USER = {
    id: 'guest-default-user',
    email: 'guest@wordfission.app',
    role: 'user' as const,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

export async function GET() {
    return NextResponse.json({ user: DEFAULT_USER });
}
