import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userId = '678b7b29-59c2-459f-a729-29b29b29b29b';
  
  // Get user libraries
  const libraries = await prisma.userLibrary.findMany({
    where: { userId },
    include: {
      _count: {
        select: { words: true }
      }
    }
  });
  
  console.log('User Libraries:');
  console.log(JSON.stringify(libraries, null, 2));
  
  // Get words from first library if exists
  if (libraries.length > 0) {
    const words = await prisma.userLibraryWord.findMany({
      where: { libraryId: libraries[0].id },
      take: 10,
      orderBy: { sequence: 'asc' }
    });
    console.log('\nFirst 10 words from first library:');
    console.log(JSON.stringify(words, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
