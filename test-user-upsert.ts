/**
 * Test User Upsert Operation
 * This simulates what API routes do when handling authenticated requests
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testUserUpsert() {
  console.log('Testing User Upsert Operation...\n');

  const testSession = {
    id: 'test-upsert-' + Date.now(),
    email: `test-${Date.now()}@test.local`,
    role: 'user'
  };

  try {
    console.log('1. Testing CREATE via upsert (user does not exist)...');
    const createdUser = await prisma.user.upsert({
      where: { id: testSession.id },
      update: {},
      create: {
        id: testSession.id,
        email: testSession.email,
        role: testSession.role,
        preferredLanguage: 'zh'
      },
    });
    console.log('✅ User created successfully:', {
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role
    });

    console.log('\n2. Testing UPDATE via upsert (user already exists)...');
    const updatedUser = await prisma.user.upsert({
      where: { id: testSession.id },
      update: {},
      create: {
        id: testSession.id,
        email: testSession.email,
        role: testSession.role,
        preferredLanguage: 'zh'
      },
    });
    console.log('✅ User upsert successful (no changes):', {
      id: updatedUser.id,
      email: updatedUser.email
    });

    console.log('\n3. Cleaning up test user...');
    await prisma.user.delete({ where: { id: testSession.id } });
    console.log('✅ Test user deleted');

    console.log('\n✅ ALL UPSERT TESTS PASSED');
    console.log('The User table is working correctly and API routes should function properly.');

  } catch (error) {
    console.error('\n❌ UPSERT TEST FAILED:', error);
    console.error('\nThis means API routes will fail when trying to upsert users.');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testUserUpsert();
