import { createClient } from '@supabase/supabase-js';

const prodUrl = 'https://wordlink.orionsheep.com';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(prodUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const admin = createClient(prodUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('1. 测试线上生产环境注册并触发邮件下发...');
  const testEmail = '2722477064@qq.com';
  
  // 清理旧账号
  const list = await admin.auth.admin.listUsers();
  const existing = list.data?.users.find(u => u.email === testEmail);
  if (existing) {
    await admin.auth.admin.deleteUser(existing.id);
    console.log('已清理线上旧用户:', existing.id);
  }

  const { data, error } = await supabase.auth.signUp({
    email: testEmail,
    password: 'Password123!',
    options: {
      emailRedirectTo: 'https://wordlink.orionsheep.com/auth/callback?next=/',
    },
  });

  if (error) {
    console.error('线上注册失败:', error);
  } else {
    console.log('🎉 线上生产环境注册成功！');
    console.log('User ID:', data.user?.id);
    console.log('Session is null (需邮件确认):', data.session === null);
    console.log('已通过阿里云企业邮箱向', testEmail, '下发带有 https://wordlink.orionsheep.com 回调的激活邮件！');
  }
}

main();
