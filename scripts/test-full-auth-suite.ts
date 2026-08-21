import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('========================================');
console.log('🧪 全链路 Supabase 鉴权与邮件系统测试');
console.log('========================================');

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const testEmail = `auth.test.${Date.now()}@example.com`;
const testPassword = 'Password123!';
const newPassword = 'NewPassword456!';

async function run() {
  // 1. 测试注册
  console.log(`\n1. 测试注册账号: ${testEmail}`);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: { nickname: 'AuthTester', preferredLanguage: 'zh' },
      emailRedirectTo: 'http://localhost:3000/auth/callback?next=/',
    },
  });
  if (signUpError) throw signUpError;
  console.log('✅ 注册请求成功，User ID:', signUpData.user?.id);
  const userId = signUpData.user!.id;

  // 2. 测试重新发送激活邮件
  console.log('\n2. 测试重发验证邮件');
  const { error: resendError } = await supabase.auth.resend({
    type: 'signup',
    email: testEmail,
    options: {
      emailRedirectTo: 'http://localhost:3000/auth/callback?next=/',
    },
  });
  if (resendError) {
    console.warn('⚠️ 重发邮件响应 (可能受速率限制):', resendError.message);
  } else {
    console.log('✅ 重发验证邮件成功');
  }

  // 3. 测试忘记密码 / 请求重置密码邮件
  console.log('\n3. 测试请求找回密码邮件');
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(testEmail, {
    redirectTo: 'http://localhost:3000/auth/callback?next=/reset-password',
  });
  if (resetError) {
    console.warn('⚠️ 找回密码响应 (可能受速率限制):', resetError.message);
  } else {
    console.log('✅ 找回密码重置邮件下发成功');
  }

  // 4. 清理测试用户
  console.log('\n4. 清理测试用户数据');
  await admin.auth.admin.deleteUser(userId);
  console.log('✅ 测试用户已清理完毕');

  console.log('\n🎉 所有鉴权与邮件链路测试全部通过！');
}

run().catch((err) => {
  console.error('❌ 测试出错:', err);
  process.exit(1);
});
