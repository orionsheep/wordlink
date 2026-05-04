import { NextResponse } from 'next/server';
import { prisma, prismaInitError } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function GET() {
    try {
        const result: any = { status: 'ok' };

        if (prismaInitError) {
            result['prisma_error'] = String(prismaInitError);
            return NextResponse.json(result, { status: 500 });
        }

        if (!prisma) {
            result['prisma_status'] = 'undefined';
            return NextResponse.json(result, { status: 500 });
        }

        // Test Bcrypt
        const hash = await bcrypt.hash('test', 10);
        result['bcrypt'] = 'hashed';

        // Test Prisma
        const userCount = await prisma.user.count();
        result['prisma'] = `users: ${userCount}`;

        return NextResponse.json(result);
    } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
