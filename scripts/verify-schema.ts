import { prisma } from '../src/lib/prisma';

async function verifySchema() {
  console.log('=== Database Schema Verification ===\n');

  try {
    // Check User table columns
    console.log('1. Checking User table columns...');
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'LPT_english'
      AND table_name = 'User'
      ORDER BY ordinal_position;
    `;
    console.log('User table columns:', JSON.stringify(columns, null, 2));

    // Check applied migrations
    console.log('\n2. Checking applied migrations...');
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, applied_steps_count
      FROM "LPT_english"."_prisma_migrations"
      ORDER BY finished_at DESC
      LIMIT 10;
    `;
    console.log('Recent migrations:', JSON.stringify(migrations, null, 2));

    // Try to query User table directly
    console.log('\n3. Testing direct User table query...');
    const userCount = await prisma.user.count();
    console.log(`Total users in database: ${userCount}`);

    // Try to find a user by email (if any exist)
    console.log('\n4. Testing email field access...');
    try {
      const testUser = await prisma.user.findFirst({
        select: {
          id: true,
          email: true,
          role: true,
        }
      });
      console.log('Sample user with email field:', testUser);
    } catch (error: any) {
      console.error('Error accessing email field:', error.message);
    }

    // Check Prisma client metadata
    console.log('\n5. Checking Prisma client version...');
    console.log('Prisma client location:', require.resolve('@prisma/client'));

    console.log('\n=== Verification Complete ===');
  } catch (error: any) {
    console.error('Verification failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifySchema()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
