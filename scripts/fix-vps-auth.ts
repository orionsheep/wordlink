import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
docker stop supabase_auth_wordlink 2>/dev/null || true
docker rm supabase_auth_wordlink 2>/dev/null || true

docker run -d \
  --name supabase_auth_wordlink \
  --restart unless-stopped \
  --network host \
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

sleep 3
docker ps | grep supabase_auth_wordlink
curl -s http://127.0.0.1:9999/health
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect((() => { const host = process.env.VPS_HOST, password = process.env.VPS_PASSWORD; if (!host || !password) throw new Error('Missing VPS_HOST / VPS_PASSWORD env vars (credentials removed from source)'); return { host, port: 22, username: 'root', password }; })());
