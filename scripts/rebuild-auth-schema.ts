import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
docker stop supabase_auth_wordlink
docker exec migrated-postgres psql -U postgres -d postgres -c "DROP SCHEMA IF EXISTS auth CASCADE;"
docker exec migrated-postgres psql -U postgres -d postgres -c "CREATE SCHEMA auth;"
docker start supabase_auth_wordlink
sleep 8
curl -s http://127.0.0.1:9999/health
echo ''
docker logs --since 1m supabase_auth_wordlink 2>&1 | grep -E 'template type|migrations applied|API started|fatal' | tail -25
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect((() => { const host = process.env.VPS_HOST, password = process.env.VPS_PASSWORD; if (!host || !password) throw new Error('Missing VPS_HOST / VPS_PASSWORD env vars (credentials removed from source)'); return { host, port: 22, username: 'root', password }; })());
