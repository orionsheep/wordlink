import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

console.log('Initializing Prisma Client...');
let prismaInstance: PrismaClient | undefined;
export let prismaInitError: any = null;

try {
    prismaInstance = globalForPrisma.prisma || new PrismaClient({
        log: ['query', 'error', 'warn'],
    });
    console.log('Prisma Client initialized successfully');
} catch (e) {
    console.error('Failed to initialize Prisma Client:', e);
    prismaInitError = e;
}

export const prisma = prismaInstance as PrismaClient;

if (process.env.NODE_ENV !== 'production' && prismaInstance) globalForPrisma.prisma = prismaInstance;
