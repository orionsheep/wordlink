import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
certbot certonly --webroot -w /var/www/html -d wordlink.orionsheep.com --account 67bd1e6c3611211758bc86275bc3562e --non-interactive --agree-tos
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect((() => { const host = process.env.VPS_HOST, password = process.env.VPS_PASSWORD; if (!host || !password) throw new Error('Missing VPS_HOST / VPS_PASSWORD env vars (credentials removed from source)'); return { host, port: 22, username: 'root', password }; })());
