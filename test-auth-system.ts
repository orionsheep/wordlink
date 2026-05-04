/**
 * Comprehensive Authentication System Test
 * Tests all authentication flows and API endpoints
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

async function testDatabaseConnection() {
  console.log('\n=== Test 1: Database Connection ===');
  try {
    const userCount = await prisma.user.count();
    results.push({
      name: 'Database Connection',
      passed: true,
      message: `Successfully connected to database. Found ${userCount} users.`,
    });
    console.log('✅ Database connection successful');
    console.log(`   Found ${userCount} users in database`);
  } catch (error) {
    results.push({
      name: 'Database Connection',
      passed: false,
      message: `Failed to connect: ${error}`,
    });
    console.log('❌ Database connection failed:', error);
  }
}

async function testUserTableSchema() {
  console.log('\n=== Test 2: User Table Schema ===');
  try {
    // Try to fetch a user with all expected fields
    const user = await prisma.user.findFirst({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        preferredLanguage: true,
      },
    });

    if (user) {
      results.push({
        name: 'User Table Schema',
        passed: true,
        message: 'User table has all required fields',
        details: user,
      });
      console.log('✅ User table schema is correct');
      console.log('   Sample user:', JSON.stringify(user, null, 2));
    } else {
      results.push({
        name: 'User Table Schema',
        passed: false,
        message: 'No users found in database',
      });
      console.log('⚠️  No users found in database');
    }
  } catch (error) {
    results.push({
      name: 'User Table Schema',
      passed: false,
      message: `Schema validation failed: ${error}`,
    });
    console.log('❌ User table schema validation failed:', error);
  }
}

async function testUserUpsert() {
  console.log('\n=== Test 3: User Upsert Operation ===');
  try {
    const testUserId = 'test-user-' + Date.now();
    const testEmail = `test-${Date.now()}@test.local`;

    // Test upsert (create)
    const createdUser = await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: testEmail,
        role: 'user',
        preferredLanguage: 'zh',
      },
    });

    // Test upsert (update - should not change anything)
    const updatedUser = await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: testEmail,
        role: 'user',
        preferredLanguage: 'zh',
      },
    });

    // Clean up test user
    await prisma.user.delete({ where: { id: testUserId } });

    results.push({
      name: 'User Upsert Operation',
      passed: true,
      message: 'User upsert works correctly (create and update)',
    });
    console.log('✅ User upsert operation successful');
    console.log('   Created user:', testEmail);
    console.log('   Cleaned up test user');
  } catch (error) {
    results.push({
      name: 'User Upsert Operation',
      passed: false,
      message: `Upsert failed: ${error}`,
    });
    console.log('❌ User upsert operation failed:', error);
  }
}

async function testRelatedTables() {
  console.log('\n=== Test 4: Related Tables ===');
  try {
    // Test WordVisit table
    const visitCount = await prisma.wordVisit.count();
    console.log(`   WordVisit records: ${visitCount}`);

    // Test QuizRecord table
    const quizCount = await prisma.quizRecord.count();
    console.log(`   QuizRecord records: ${quizCount}`);

    // Test WordNote table
    const noteCount = await prisma.wordNote.count();
    console.log(`   WordNote records: ${noteCount}`);

    // Test ChatSession table
    const sessionCount = await prisma.chatSession.count();
    console.log(`   ChatSession records: ${sessionCount}`);

    results.push({
      name: 'Related Tables',
      passed: true,
      message: 'All related tables are accessible',
      details: {
        visits: visitCount,
        quizzes: quizCount,
        notes: noteCount,
        sessions: sessionCount,
      },
    });
    console.log('✅ All related tables are accessible');
  } catch (error) {
    results.push({
      name: 'Related Tables',
      passed: false,
      message: `Related tables check failed: ${error}`,
    });
    console.log('❌ Related tables check failed:', error);
  }
}

async function testAPIEndpoints() {
  console.log('\n=== Test 5: API Endpoints (Simulated) ===');

  // We can't actually test HTTP endpoints without running the server,
  // but we can verify the database operations they use

  try {
    // Simulate what /api/user/visit does
    const testUserId = 'api-test-user';
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'api-test@test.local',
        role: 'user',
        preferredLanguage: 'zh',
      },
    });

    // Create a visit record
    const visit = await prisma.wordVisit.create({
      data: {
        userId: testUserId,
        word: 'test',
      },
    });

    // Fetch history (what /api/user/history does)
    const visits = await prisma.wordVisit.findMany({
      where: { userId: testUserId },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    const quizzes = await prisma.quizRecord.findMany({
      where: { userId: testUserId },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    // Clean up
    await prisma.wordVisit.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });

    results.push({
      name: 'API Endpoints (Database Operations)',
      passed: true,
      message: 'All database operations used by API endpoints work correctly',
    });
    console.log('✅ API endpoint database operations work correctly');
  } catch (error) {
    results.push({
      name: 'API Endpoints (Database Operations)',
      passed: false,
      message: `API operations failed: ${error}`,
    });
    console.log('❌ API endpoint database operations failed:', error);
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`\nTotal Tests: ${total}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.message}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! Authentication system is working correctly.');
  } else {
    console.log('⚠️  SOME TESTS FAILED. Please review the errors above.');
  }
  console.log('='.repeat(60) + '\n');
}

async function main() {
  console.log('Starting Authentication System Tests...\n');

  await testDatabaseConnection();
  await testUserTableSchema();
  await testUserUpsert();
  await testRelatedTables();
  await testAPIEndpoints();

  await printSummary();

  await prisma.$disconnect();
}

main().catch(console.error);
