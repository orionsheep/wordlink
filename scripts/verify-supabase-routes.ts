import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

config({ path: '.env.local' });
config({ path: '.env' });

const baseUrl = process.env.WORDLINK_TEST_BASE_URL || 'http://127.0.0.1:3011';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey || !process.env.DATABASE_URL) {
  throw new Error('Supabase route verification environment is incomplete');
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const prisma = new PrismaClient();
const usersToClean = new Set<string>();

type Json = Record<string, unknown>;

function updateCookies(jar: Map<string, string>, response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (response.headers.get('set-cookie') || '').split(/,(?=[^;]+=[^;]+)/g).filter(Boolean);

  for (const cookie of setCookies) {
    const pair = cookie.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}

async function callRoute(
  path: string,
  options: RequestInit = {},
  jar = new Map<string, string>(),
) {
  const headers = new Headers(options.headers);
  const cookie = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  if (cookie) headers.set('cookie', cookie);

  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  updateCookies(jar, response);
  const text = await response.text();
  let body: Json = {};
  if (text) {
    try {
      body = JSON.parse(text) as Json;
    } catch {
      body = { raw: text };
    }
  }
  return { response, body };
}

function jsonBody(value: Json) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  } satisfies RequestInit;
}

function assertStatus(actual: number, expected: number, body: Json, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${actual}: ${JSON.stringify(body)}`);
  }
}

async function register(email: string, password: string, jar: Map<string, string>) {
  const result = await callRoute('/api/auth/register', jsonBody({ email, password }), jar);
  assertStatus(result.response.status, 200, result.body, 'register');
  const user = result.body.user as { id?: string } | undefined;
  if (!user?.id) throw new Error(`register did not return a user: ${JSON.stringify(result.body)}`);
  usersToClean.add(user.id);
  return user.id;
}

async function cleanup() {
  for (const userId of usersToClean) {
    try {
      await prisma.user.deleteMany({ where: { id: userId } });
    } catch (error) {
      console.warn(`Business cleanup failed for ${userId}:`, error);
    }
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // The delete route may already have removed this auth identity.
    }
  }
  await prisma.$disconnect();
}

async function main() {
  const suffix = Date.now();
  const password = 'WordLink!RouteCheck2026';
  const firstEmail = `wordlink.route.${suffix}@example.test`;
  const firstCookies = new Map<string, string>();

  const firstId = await register(firstEmail, password, firstCookies);

  let result = await callRoute('/api/auth/me', { method: 'GET' }, firstCookies);
  assertStatus(result.response.status, 200, result.body, 'me after register');
  if ((result.body.user as { id?: string } | undefined)?.id !== firstId) {
    throw new Error(`me returned the wrong user: ${JSON.stringify(result.body)}`);
  }
  console.log('Register + /api/auth/me: PASS');

  result = await callRoute('/api/auth/logout', { method: 'POST' }, firstCookies);
  assertStatus(result.response.status, 200, result.body, 'logout');

  result = await callRoute('/api/auth/me', { method: 'GET' }, firstCookies);
  assertStatus(result.response.status, 401, result.body, 'me after logout');
  console.log('Logout + protected session invalidation: PASS');

  result = await callRoute('/api/auth/login', jsonBody({ email: firstEmail, password }), firstCookies);
  assertStatus(result.response.status, 200, result.body, 'login');
  if ((result.body.user as { id?: string } | undefined)?.id !== firstId) {
    throw new Error(`login returned the wrong user: ${JSON.stringify(result.body)}`);
  }
  console.log('Login: PASS');

  const deleteEmail = `wordlink.delete.${suffix}@example.test`;
  const deleteCookies = new Map<string, string>();
  const deleteId = await register(deleteEmail, password, deleteCookies);
  result = await callRoute('/api/user/delete', { method: 'POST' }, deleteCookies);
  assertStatus(result.response.status, 200, result.body, 'delete account');

  const deletedAuthUser = await admin.auth.admin.getUserById(deleteId);
  const deletedProfile = await prisma.user.findUnique({ where: { id: deleteId }, select: { id: true } });
  if (deletedAuthUser.data.user || deletedProfile) {
    throw new Error('delete account left an auth user or business profile behind');
  }
  usersToClean.delete(deleteId);
  console.log('Account deletion (Auth + business data): PASS');
}

main()
  .catch((error) => {
    console.error('Supabase route verification failed:', error);
    process.exitCode = 1;
  })
  .finally(cleanup);
