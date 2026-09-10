import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
docker exec migrated-postgres psql -U postgres -d postgres -c 'ALTER DATABASE postgres SET search_path TO "$user", public, auth, extensions;'
docker exec migrated-postgres psql -U postgres -d postgres -c 'ALTER ROLE postgres SET search_path TO "$user", public, auth, extensions;'
docker restart supabase_auth_wordlink
sleep 3
curl -s http://127.0.0.1:9999/health
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect((() => { const host = process.env.VPS_HOST, password = process.env.VPS_PASSWORD; if (!host || !password) throw new Error('Missing VPS_HOST / VPS_PASSWORD env vars (credentials removed from source)'); return { host, port: 22, username: 'root', password }; })());
