import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
# 1. 同步最新模板文件到宿主机挂载目录
mkdir -p /etc/gotrue-templates
echo '模板目录已就绪'

# 2. 停掉旧容器
docker rm -f supabase_auth_wordlink 2>/dev/null

# 3. 用完整配置重建容器（含模板 URL 环境变量）
docker run -d --name supabase_auth_wordlink \\
  --network host \\
  --restart unless-stopped \\
  -e GOTRUE_API_HOST=0.0.0.0 \\
  -e GOTRUE_API_PORT=9999 \\
  -e API_EXTERNAL_URL=https://wordlink.orionsheep.com \\
  -e GOTRUE_SITE_URL=https://wordlink.orionsheep.com \\
  -e GOTRUE_DB_DRIVER=postgres \\
  -e GOTRUE_DB_DATABASE_URL="postgresql://postgres:d097e2915fd48dc42e4ce39f629108629f0b@127.0.0.1:15433/postgres?search_path=auth" \\
  -e GOTRUE_JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long" \\
  -e GOTRUE_JWT_EXP=3600 \\
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \\
  -e GOTRUE_JWT_ADMIN_GROUP_NAME=supabase_admin \\
  -e GOTRUE_SMTP_HOST=smtp.qiye.aliyun.com \\
  -e GOTRUE_SMTP_PORT=465 \\
  -e GOTRUE_SMTP_USER=wordlink@orionsheep.com \\
  -e GOTRUE_SMTP_PASS=328mN0z3xxrV70d4 \\
  -e GOTRUE_SMTP_ADMIN_EMAIL=wordlink@orionsheep.com \\
  -e GOTRUE_SMTP_SENDER_NAME=WordLink \\
  -e GOTRUE_SMTP_MAX_FREQUENCY=1s \\
  -e GOTRUE_MAILER_AUTOCONFIRM=false \\
  -e GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true \\
  -e GOTRUE_MAILER_OTP_EXP=3600 \\
  -e GOTRUE_MAILER_OTP_LENGTH=6 \\
  -e GOTRUE_MAILER_TEMPLATE_RELOADING_ENABLED=true \\
  -e GOTRUE_MAILER_SUBJECTS_CONFIRMATION="WordLink - 确认您的邮箱地址" \\
  -e GOTRUE_MAILER_SUBJECTS_RECOVERY="WordLink - 重置您的账号密码" \\
  -e GOTRUE_MAILER_SUBJECTS_MAGIC_LINK="WordLink - 您的魔法登录链接" \\
  -e GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE="WordLink - 确认您的邮箱变更" \\
  -e GOTRUE_MAILER_URLPATHS_INVITE=https://wordlink.orionsheep.com/auth/v1/verify \\
  -e GOTRUE_MAILER_URLPATHS_CONFIRMATION=https://wordlink.orionsheep.com/auth/callback \\
  -e GOTRUE_MAILER_URLPATHS_RECOVERY=https://wordlink.orionsheep.com/auth/v1/verify \\
  -e GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=https://wordlink.orionsheep.com/auth/v1/verify \\
  -e GOTRUE_MAILER_TEMPLATES_CONFIRMATION=https://wordlink.orionsheep.com/templates/confirmation.html \\
  -e GOTRUE_MAILER_TEMPLATES_RECOVERY=https://wordlink.orionsheep.com/templates/recovery.html \\
  -e GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=https://wordlink.orionsheep.com/templates/magic_link.html \\
  -e GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE=https://wordlink.orionsheep.com/templates/email_change.html \\
  -v /etc/gotrue-templates:/etc/gotrue-templates \\
  public.ecr.aws/supabase/gotrue:v2.195.0

sleep 4
echo '=== 健康检查 ==='
curl -s http://127.0.0.1:9999/health
echo ''
echo '=== 模板加载日志 ==='
docker logs supabase_auth_wordlink 2>&1 | grep -E 'template|migrations applied|API started' | tail -20
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect((() => { const host = process.env.VPS_HOST, password = process.env.VPS_PASSWORD; if (!host || !password) throw new Error('Missing VPS_HOST / VPS_PASSWORD env vars (credentials removed from source)'); return { host, port: 22, username: 'root', password }; })());
