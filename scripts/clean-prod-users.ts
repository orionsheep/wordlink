import { createClient } from '@supabase/supabase-js';

const prodUrl = 'https://wordlink.orionsheep.com';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(prodUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const list = await admin.auth.admin.listUsers();
  console.log('Online users count:', list.data?.users.length);
  for (const u of list.data?.users || []) {
    console.log(`Cleaning user: ${u.email} (${u.id})`);
    await admin.auth.admin.deleteUser(u.id);
  }
  console.log('✅ 线上测试用户已清理干净！');
}

main();
