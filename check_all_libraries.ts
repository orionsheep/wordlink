import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all user libraries
  const libraries = await prisma.userLibrary.findMany({
    include: {
      _count: {
        select: { words: true }
      }
    }
  });
  
  console.log(`Total user libraries in database: ${libraries.length}`);
  console.log(JSON.stringify(libraries, null, 2));
  
  // Get the test user
  const user = await prisma.user.findUnique({
    where: { email: 'zjyuiop321@gmail.com' }
  });
  
  console.log('\nTest user info:');
  console.log(JSON.stringify(user, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
