import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
echo '=== 宿主机模板目录 ==='
ls -la /etc/gotrue-templates/ 2>/dev/null
echo ''
echo '=== 容器内目录 ==='
docker exec supabase_auth_wordlink ls -la /etc/gotrue-templates/ 2>/dev/null
echo ''
echo '=== 全部环境变量中含 TEMPLATE 的 ==='
docker inspect supabase_auth_wordlink --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -i template
echo ''
echo '=== 启动命令 ==='
docker inspect supabase_auth_wordlink --format '{{.Config.Cmd}}'
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect((() => { const host = process.env.VPS_HOST, password = process.env.VPS_PASSWORD; if (!host || !password) throw new Error('Missing VPS_HOST / VPS_PASSWORD env vars (credentials removed from source)'); return { host, port: 22, username: 'root', password }; })());
