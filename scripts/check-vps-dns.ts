import dns from 'dns';
import { Client } from 'ssh2';

console.log('1. 正在检查 DNS 域名解析: wordlink.orionsheep.com...');
dns.resolve4('wordlink.orionsheep.com', (err, addresses) => {
  if (err) {
    console.warn('DNS lookup note:', err.message);
  } else {
    console.log('✅ DNS 解析结果:', addresses);
  }
});

const conn = new Client();
conn.on('ready', () => {
  console.log('\n2. 连接 VPS 检查 Nginx 与 Docker 容器...');
  const cmd = `
echo "=== VPS 上的 Docker 容器 ==="
docker ps

echo -e "\n=== 检查 Certbot 申请证书 ==="
certbot certificates 2>/dev/null || true

echo -e "\n=== 检查 Nginx 访问配置 ==="
cat /etc/nginx/conf.d/wordlink.conf 2>/dev/null || true
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect((() => { const host = process.env.VPS_HOST, password = process.env.VPS_PASSWORD; if (!host || !password) throw new Error('Missing VPS_HOST / VPS_PASSWORD env vars (credentials removed from source)'); return { host, port: 22, username: 'root', password }; })());
