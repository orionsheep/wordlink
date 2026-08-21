import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

config({ path: '.env.local' });
config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const prisma = new PrismaClient();

async function main() {
  console.log('--- 查找所有用户 ---');
  const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (authError) {
    console.error('List auth users error:', authError);
  } else {
    console.log(`Auth users count: ${authUsers.users.length}`);
    for (const u of authUsers.users) {
      console.log(`Auth User: ID=${u.id}, Email=${u.email}, Confirmed=${u.email_confirmed_at}`);
    }
  }

  const prismaUsers = await prisma.user.findMany();
  console.log(`Prisma users count: ${prismaUsers.length}`);
  for (const u of prismaUsers) {
    console.log(`Prisma User: ID=${u.id}, Email=${u.email}`);
  }

  const targetEmails = ['zjyuiop321@gmail.com', '2722477064@qq.com'];

  for (const email of targetEmails) {
    console.log(`\n正在删除用户: ${email}...`);
    // Delete from prisma
    try {
      const delPrisma = await prisma.user.deleteMany({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      console.log(`已从 Prisma 删除 ${delPrisma.count} 条记录 (${email})`);
    } catch (err: any) {
      console.warn('Prisma delete error:', err.message);
    }

    // Delete from auth
    const matched = authUsers?.users.filter(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (matched && matched.length > 0) {
      for (const m of matched) {
        const delAuth = await supabaseAdmin.auth.admin.deleteUser(m.id);
        if (delAuth.error) {
          console.error(`删除 Auth 用户 ${m.id} 失败:`, delAuth.error);
        } else {
          console.log(`已成功删除 Supabase Auth 用户: ${m.email} (${m.id})`);
        }
      }
    }
  }

  console.log('\n--- 清理完成 ---');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
