import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Adding preferredLanguage column to User table...');

    // Execute raw SQL to add the column
    await prisma.$executeRaw`
      ALTER TABLE "LPT_english"."User"
      ADD COLUMN IF NOT EXISTS "preferredLanguage" TEXT NOT NULL DEFAULT 'zh';
    `;

    console.log('Column added successfully!');
  } catch (error) {
    console.error('Error adding column:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
