import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
);

async function main() {
  console.log('Sending newly styled verification email to 2722477064@qq.com...');
  const res = await supabase.auth.signUp({
    email: '2722477064@qq.com',
    password: 'Password123!',
    options: {
      emailRedirectTo: 'http://localhost:3001/auth/callback?next=/',
    },
  });

  if (res.error) {
    console.error('Error:', res.error.message);
  } else {
    console.log('🎉 验证邮件已发送至 2722477064@qq.com！请前往邮箱查看全新设计的邮件样式！');
  }
}

main();
