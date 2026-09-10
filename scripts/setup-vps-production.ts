import fs from 'fs';
import { Client } from 'ssh2';

const VPS_HOST = process.env.VPS_HOST;
const VPS_USER = 'root';
const VPS_PASS = process.env.VPS_PASSWORD;
if (!VPS_HOST || !VPS_PASS) {
  console.error('Missing VPS_HOST / VPS_PASSWORD env vars (credentials removed from source)');
  process.exit(1);
}

const confirmHtml = fs.readFileSync('supabase/templates/confirmation.html', 'utf8');
const recoveryHtml = fs.readFileSync('supabase/templates/recovery.html', 'utf8');

console.log('Connecting to VPS to configure production SSL, Supabase Auth, Nginx and Callback URLs...');

const conn = new Client();
conn.on('ready', () => {
  console.log('✅ SSH Connected!');

  const cmd = `
set -e

echo "=== 1. 创建模板目录并同步 Liquid Glass 邮件模板 ==="
mkdir -p /etc/gotrue-templates

cat << 'EOF' > /etc/gotrue-templates/confirmation.html
${confirmHtml}
EOF

cat << 'EOF' > /etc/gotrue-templates/recovery.html
${recoveryHtml}
EOF

echo "=== 2. 申请 Let's Encrypt SSL 证书 (wordlink.orionsheep.com) ==="
certbot certonly --webroot -w /var/www/html -d wordlink.orionsheep.com --non-interactive --agree-tos --email postmaster@orionsheep.com || true

echo "=== 3. 启动/更新 Supabase GoTrue 认证容器 (生产环境) ==="
docker pull public.ecr.aws/supabase/gotrue:v2.195.0 || true
docker stop supabase_auth_wordlink 2>/dev/null || true
docker rm supabase_auth_wordlink 2>/dev/null || true

docker run -d \
  --name supabase_auth_wordlink \
  --restart unless-stopped \
  -p 127.0.0.1:9999:9999 \
  -v /etc/gotrue-templates:/etc/gotrue-templates:ro \
  -e "GOTRUE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long" \
  -e "GOTRUE_MAILER_OTP_LENGTH=6" \
  -e "GOTRUE_RATE_LIMIT_ANONYMOUS_USERS=30" \
  -e "GOTRUE_SECURITY_CAPTCHA_ENABLED=false" \
  -e "API_EXTERNAL_URL=https://wordlink.orionsheep.com/auth/v1" \
  -e "GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=https://wordlink.orionsheep.com/auth/v1/verify" \
  -e "GOTRUE_SMS_MAX_FREQUENCY=5s" \
  -e "GOTRUE_URI_ALLOW_LIST=https://wordlink.orionsheep.com,http://wordlink.orionsheep.com,https://wordlink.orionsheep.com/auth/callback,http://wordlink.orionsheep.com/auth/callback" \
  -e "GOTRUE_JWT_AUD=authenticated" \
  -e "GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=false" \
  -e "GOTRUE_MFA_TOTP_ENROLL_ENABLED=false" \
  -e "GOTRUE_MFA_WEB_AUTHN_ENROLL_ENABLED=false" \
  -e "GOTRUE_RATE_LIMIT_TOKEN_REFRESH=150" \
  -e "GOTRUE_EXTERNAL_WEB3_ETHEREUM_ENABLED=false" \
  -e "GOTRUE_DB_DATABASE_URL=postgresql://postgres:d097e2915fd48dc42e4ce39f629108629f0b@127.0.0.1:15433/postgres" \
  -e "GOTRUE_MAILER_OTP_EXP=3600" \
  -e "GOTRUE_JWT_EXP=3600" \
  -e "GOTRUE_MAILER_URLPATHS_RECOVERY=https://wordlink.orionsheep.com/auth/v1/verify" \
  -e "GOTRUE_SMS_OTP_EXP=6000" \
  -e "GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10" \
  -e "GOTRUE_JWT_VALIDMETHODS=HS256,RS256,ES256" \
  -e "GOTRUE_RATE_LIMIT_OTP=30" \
  -e "GOTRUE_RATE_LIMIT_WEB3=30" \
  -e "GOTRUE_JWT_VALID_METHODS=HS256,RS256,ES256" \
  -e "GOTRUE_RATE_LIMIT_EMAIL_SENT=360000" \
  -e "GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true" \
  -e "GOTRUE_MFA_MAX_ENROLLED_FACTORS=10" \
  -e "GOTRUE_SITE_URL=https://wordlink.orionsheep.com" \
  -e "GOTRUE_RATE_LIMIT_VERIFY=30" \
  -e "GOTRUE_SMTP_HOST=smtp.qiye.aliyun.com" \
  -e "GOTRUE_SMTP_PORT=465" \
  -e "GOTRUE_SMTP_USER=wordlink@orionsheep.com" \
  -e "GOTRUE_SMTP_PASS=328mN0z3xxrV70d4" \
  -e "GOTRUE_SMTP_ADMIN_EMAIL=wordlink@orionsheep.com" \
  -e "GOTRUE_SMTP_SENDER_NAME=WordLink" \
  -e "GOTRUE_DB_DRIVER=postgres" \
  -e "GOTRUE_MFA_TOTP_VERIFY_ENABLED=false" \
  -e "GOTRUE_MFA_WEB_AUTHN_VERIFY_ENABLED=false" \
  -e "GOTRUE_EXTERNAL_WEB3_SOLANA_ENABLED=false" \
  -e "GOTRUE_API_PORT=9999" \
  -e "GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true" \
  -e "GOTRUE_MAILER_AUTOCONFIRM=false" \
  -e "GOTRUE_MAILER_URLPATHS_INVITE=https://wordlink.orionsheep.com/auth/v1/verify" \
  -e "GOTRUE_RATE_LIMIT_SMS_SENT=30" \
  -e "GOTRUE_JWT_KEYS=[{\\"kty\\":\\"EC\\",\\"kid\\":\\"b81269f1-21d8-4f2e-b719-c2240a840d90\\",\\"use\\":\\"sig\\",\\"key_ops\\":[\\"sign\\",\\"verify\\"],\\"alg\\":\\"ES256\\",\\"ext\\":true,\\"d\\":\\"dIhR8wywJlqlua4y_yMq2SLhlFXDZJBCvFrY1DCHyVU\\",\\"crv\\":\\"P-256\\",\\"x\\":\\"M5Sjqn5zwC9Kl1zVfUUGvv9boQjCGd45G8sdopBExB4\\",\\"y\\":\\"P6IXMvA2WYXSHSOMTBH2jsw_9rrzGy89FjPf6oOsIxQ\\"}]" \
  -e "GOTRUE_EXTERNAL_EMAIL_ENABLED=true" \
  -e "GOTRUE_SMTP_MAX_FREQUENCY=1s" \
  -e "GOTRUE_MAILER_SUBJECTS_CONFIRMATION=WordLink - 确认您的邮箱地址" \
  -e "GOTRUE_MAILER_SUBJECTS_RECOVERY=WordLink - 重置您的账号密码" \
  -e "GOTRUE_MAILER_TEMPLATE_RELOADING_ENABLED=true" \
  -e "GOTRUE_PASSWORD_MIN_LENGTH=6" \
  -e "GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false" \
  -e "GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=false" \
  -e "GOTRUE_JWT_ISSUER=https://wordlink.orionsheep.com/auth/v1" \
  -e "GOTRUE_MAILER_URLPATHS_CONFIRMATION=https://wordlink.orionsheep.com/auth/callback" \
  -e "GOTRUE_SMS_OTP_LENGTH=6" \
  -e "GOTRUE_JWT_ADMIN_ROLES=service_role" \
  -e "GOTRUE_API_HOST=0.0.0.0" \
  -e "GOTRUE_DISABLE_SIGNUP=false" \
  -e "GOTRUE_DB_MIGRATIONS_PATH=/usr/local/etc/auth/migrations" \
  public.ecr.aws/supabase/gotrue:v2.195.0 auth

echo "=== 4. 配置 Nginx 虚拟主机 (包含 HTTPS 与 /auth/v1/ 路由) ==="
if [ -f /etc/letsencrypt/live/wordlink.orionsheep.com/fullchain.pem ]; then
cat << 'EOF' > /etc/nginx/conf.d/wordlink.conf
# HTTP -> HTTPS 重定向
server {
    listen 80;
    server_name wordlink.orionsheep.com;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

# HTTPS 主服务
server {
    listen 443 ssl http2;
    server_name wordlink.orionsheep.com;

    ssl_certificate     /etc/letsencrypt/live/wordlink.orionsheep.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wordlink.orionsheep.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 1. Supabase Auth 路由 (邮件验证与 API)
    location /auth/v1/ {
        proxy_pass http://127.0.0.1:9999/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 2. Next.js 生产应用
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
EOF
else
cat << 'EOF' > /etc/nginx/conf.d/wordlink.conf
# HTTP 服务 (待证书签发)
server {
    listen 80;
    server_name wordlink.orionsheep.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location /auth/v1/ {
        proxy_pass http://127.0.0.1:9999/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
EOF
fi

nginx -t && nginx -s reload || systemctl reload nginx

echo "=== 5. 更新 WordLink 生产环境 .env 与 PM2 重启 ==="
cd /www/wwwroot/wordlink

cat << 'EOF' > .env
NODE_ENV=production
PORT=3001
NEXT_PUBLIC_SITE_URL="https://wordlink.orionsheep.com"
DATABASE_URL="postgresql://postgres:d097e2915fd48dc42e4ce39f629108629f0b@127.0.0.1:15433/postgres?schema=LPT_english"

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL="https://wordlink.orionsheep.com"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

# Aliyun SMTP
SMTP_HOST="smtp.qiye.aliyun.com"
SMTP_PORT="465"
SMTP_USER="wordlink@orionsheep.com"
SMTP_PASS="328mN0z3xxrV70d4"
SUPABASE_AUTH_SMTP_PASS="328mN0z3xxrV70d4"
SMTP_ADMIN_EMAIL="wordlink@orionsheep.com"
SMTP_SENDER_NAME="WordLink"
EOF

pm2 restart wordlink || pm2 start npm --name wordlink -- start -- -p 3001
pm2 save

echo "=== 6. 验证服务响应状态 ==="
sleep 2
curl -s -I http://127.0.0.1:9999/health || true
curl -s -I http://127.0.0.1:3001/login | head -n 5
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code: number) => {
      console.log(`\n=== 生产环境配置执行完毕 (Exit code: ${code}) ===`);
      conn.end();
    }).on('data', (d: Buffer) => {
      process.stdout.write(d.toString());
    }).stderr.on('data', (d: Buffer) => {
      process.stderr.write(d.toString());
    });
  });
}).connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS });
