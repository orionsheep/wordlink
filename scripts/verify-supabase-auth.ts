import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

// Next loads .env.local before .env. The standalone verification script does
// the same explicitly so it can be run with `npx tsx`.
config({ path: '.env.local' });
config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey || !process.env.DATABASE_URL) {
  throw new Error('Supabase verification environment is incomplete');
}

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const prisma = new PrismaClient();

const email = `wordlink.verify.${Date.now()}@example.test`;
const password = 'WordLink!Verify2026';
let userId: string | undefined;

async function cleanup() {
  if (!userId) return;

  // Remove the business profile first, then the auth identity. Both operations
  // are idempotent for this short-lived verification user.
  try {
    await prisma.user.deleteMany({ where: { id: userId } });
  } catch (error) {
    console.warn('Business profile cleanup failed:', error);
  }

  try {
    await admin.auth.admin.deleteUser(userId);
  } catch (error) {
    console.warn('Auth user cleanup failed:', error);
  }
}

async function main() {
  console.log(`Registering temporary verification user ${email}`);

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nickname: 'Supabase Trigger Check',
        preferredLanguage: 'zh',
      },
    },
  });

  if (signUpError || !signUpData.user) {
    throw new Error(signUpError?.message || 'Supabase signUp did not return a user');
  }
  userId = signUpData.user.id;

  const authUser = await admin.auth.admin.getUserById(userId);
  if (authUser.error || !authUser.data.user) {
    throw new Error(authUser.error?.message || 'Auth user was not persisted');
  }

  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      nickname: true,
      preferredLanguage: true,
      role: true,
    },
  });

  if (!profile) {
    throw new Error('on_auth_user_created did not create LPT_english.User');
  }

  const expectedEmail = email.toLowerCase();
  if (
    profile.email !== expectedEmail ||
    profile.nickname !== 'Supabase Trigger Check' ||
    profile.preferredLanguage !== 'zh' ||
    profile.role !== 'user'
  ) {
    throw new Error(`Business profile values are incorrect: ${JSON.stringify(profile)}`);
  }

  if (signUpData.session) {
    const { data: currentUser, error: currentUserError } = await supabase.auth.getUser();
    if (currentUserError || currentUser.user?.id !== userId) {
      throw new Error(currentUserError?.message || 'Supabase session lookup failed');
    }
    console.log('Session lookup: PASS');
  } else {
    console.log('Session lookup: skipped (email confirmation is enabled)');
  }

  console.log('Auth user persistence: PASS');
  console.log('LPT_english.User trigger profile: PASS');
}

main()
  .catch((error) => {
    console.error('Supabase auth verification failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
