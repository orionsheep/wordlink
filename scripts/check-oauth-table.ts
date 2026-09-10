import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
docker exec migrated-postgres psql -U postgres -d postgres -c "
SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = 'oauth_clients';
SELECT schemaname, indexname FROM pg_indexes WHERE indexname LIKE 'oauth_clients%';
"
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect((() => { const host = process.env.VPS_HOST, password = process.env.VPS_PASSWORD; if (!host || !password) throw new Error('Missing VPS_HOST / VPS_PASSWORD env vars (credentials removed from source)'); return { host, port: 22, username: 'root', password }; })());
