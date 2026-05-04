import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUserTable() {
    try {
        // Try to query the User table
        const users = await prisma.user.findMany({
            take: 5
        });
        console.log('✅ User table exists!');
        console.log(`Found ${users.length} users:`);
        users.forEach(user => {
            console.log(`  - ${user.email} (${user.id})`);
        });
    } catch (error) {
        console.error('❌ Error accessing User table:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUserTable();
