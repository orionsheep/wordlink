import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
cat << 'EOF' > /etc/nginx/conf.d/wordlink.conf
# HTTP -> HTTPS 强制跳转
server {
    listen 80;
    server_name wordlink.orionsheep.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS 生产环境完整服务
server {
    listen 443 ssl http2;
    server_name wordlink.orionsheep.com;

    ssl_certificate     /etc/letsencrypt/live/wordlink.orionsheep.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wordlink.orionsheep.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers off;

    # 1. Supabase GoTrue Auth API 网关 (邮箱验证回调、Token 刷新与 Session 认证)
    location /auth/v1/ {
        proxy_pass http://127.0.0.1:9999/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;
    }

    # 2. Next.js 生产应用主服务
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;
    }
}
EOF

nginx -t && nginx -s reload
echo "✅ Nginx HTTPS 配置已成功重载！"
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect((() => { const host = process.env.VPS_HOST, password = process.env.VPS_PASSWORD; if (!host || !password) throw new Error('Missing VPS_HOST / VPS_PASSWORD env vars (credentials removed from source)'); return { host, port: 22, username: 'root', password }; })());
