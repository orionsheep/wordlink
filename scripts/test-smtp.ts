import tls from 'tls';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const host = process.env.SMTP_HOST || 'smtp.qiye.aliyun.com';
const port = parseInt(process.env.SMTP_PORT || '465', 10);
const user = process.env.SMTP_USER || process.env.SMTP_ADMIN_EMAIL || 'postmaster@orionsheep.com';
const pass = process.env.SMTP_PASS || process.env.SUPABASE_AUTH_SMTP_PASS || '';
const toEmail = process.env.SMTP_TEST_TO || user;

console.log('========================================');
console.log('📧 阿里云企业邮箱 SMTP 连接与认证测试');
console.log('========================================');
console.log(`SMTP Host: ${host}`);
console.log(`SMTP Port: ${port}`);
console.log(`SMTP User: ${user}`);
console.log(`Recipient: ${toEmail}`);
console.log('----------------------------------------');

if (!pass) {
  console.error('❌ 缺少 SMTP 密码！');
  console.log('请在 .env.local 中配置 SMTP_PASS=你的邮箱密码 或通过环境变量传入：');
  console.log('  SMTP_PASS="xxxx" npx tsx scripts/test-smtp.ts\n');
  process.exit(1);
}

function sendCommand(socket: tls.TLSSocket, cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const onData = (data: Buffer) => {
      const response = data.toString();
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      resolve(response.trim());
    };
    const onError = (err: Error) => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      reject(err);
    };

    socket.on('data', onData);
    socket.on('error', onError);

    if (cmd) {
      socket.write(cmd + '\r\n');
    }
  });
}

async function run() {
  const socket = tls.connect(port, host, { servername: host });

  socket.once('error', (err) => {
    console.error('❌ 连接失败:', err.message);
    process.exit(1);
  });

  // 1. 等待欢迎消息
  const banner = await new Promise<string>((resolve) => {
    socket.once('data', (d) => resolve(d.toString().trim()));
  });
  console.log('✅ 服务器连接成功:', banner);

  // 2. EHLO
  const ehloRes = await sendCommand(socket, `EHLO localhost`);
  console.log('✅ EHLO 握手成功');

  // 3. AUTH LOGIN
  const authPrompt = await sendCommand(socket, 'AUTH LOGIN');
  if (!authPrompt.startsWith('334')) {
    throw new Error(`AUTH LOGIN 失败: ${authPrompt}`);
  }

  // 4. 发送用户名 (base64)
  const userB64 = Buffer.from(user).toString('base64');
  const userPrompt = await sendCommand(socket, userB64);
  if (!userPrompt.startsWith('334')) {
    throw new Error(`用户名认证失败: ${userPrompt}`);
  }

  // 5. 发送密码 (base64)
  const passB64 = Buffer.from(pass).toString('base64');
  const passRes = await sendCommand(socket, passB64);
  if (!passRes.startsWith('235')) {
    console.error('❌ 邮箱密码认证失败:', passRes);
    console.error('👉 请确认账号和密码是否正确，并在阿里云企业邮箱后台确认开启了客户端访问权限。');
    socket.end();
    return;
  }
  console.log('🎉 邮箱账号与密码认证成功 (235 Authentication successful)!');

  // 6. 发送测试邮件
  const mailFromRes = await sendCommand(socket, `MAIL FROM:<${user}>`);
  if (!mailFromRes.startsWith('250')) {
    throw new Error(`MAIL FROM 失败: ${mailFromRes}`);
  }

  const rcptToRes = await sendCommand(socket, `RCPT TO:<${toEmail}>`);
  if (!rcptToRes.startsWith('250')) {
    throw new Error(`RCPT TO 失败: ${rcptToRes}`);
  }

  const dataPrompt = await sendCommand(socket, 'DATA');
  if (!dataPrompt.startsWith('354')) {
    throw new Error(`DATA 握手失败: ${dataPrompt}`);
  }

  const message = [
    `From: "WordLink Auth" <${user}>`,
    `To: <${toEmail}>`,
    `Subject: =?UTF-8?B?${Buffer.from('WordLink 阿里云企业邮箱接入测试').toString('base64')}?=`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    `<h2>🎉 恭喜！WordLink 阿里云企业邮箱 SMTP 接入成功</h2>
<p>您的发信邮箱 <b>${user}</b> 已成功连通 Supabase 认证体系。</p>
<p>发送时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>`,
    '.',
  ].join('\r\n');

  const sendRes = await sendCommand(socket, message);
  if (sendRes.startsWith('250')) {
    console.log(`✅ 测试邮件已成功投递至 ${toEmail}! (${sendRes})`);
  } else {
    console.warn(`⚠️ 邮件发送响应:`, sendRes);
  }

  await sendCommand(socket, 'QUIT');
  socket.end();
}

run().catch((err) => {
  console.error('❌ 测试过程中出错:', err.message);
  process.exit(1);
});
