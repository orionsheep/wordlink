import { prisma } from './src/lib/prisma';

async function checkDatabase() {
  try {
    console.log('Checking database schema...');

    // Try to query users
    const users = await prisma.user.findMany({
      take: 1,
    });

    console.log('Users found:', users.length);
    if (users.length > 0) {
      console.log('Sample user:', JSON.stringify(users[0], null, 2));
    }

    // Check if we can access email field
    const userWithEmail = await prisma.user.findFirst({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    console.log('User with email field:', JSON.stringify(userWithEmail, null, 2));

  } catch (error) {
    console.error('Database check error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
