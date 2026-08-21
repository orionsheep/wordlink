const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const port = process.env.PORT || 3000;
const logFile = path.join(__dirname, '..', 'server.log');
const out = fs.openSync(logFile, 'a');
const err = fs.openSync(logFile, 'a');

console.log(`Starting Next.js server on port ${port} (detached)...`);

const child = spawn(
  process.execPath,
  [path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)],
  {
    cwd: path.join(__dirname, '..'),
    detached: true,
    stdio: ['ignore', out, err],
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
    },
  }
);

child.unref();
console.log(`Next.js server started in background (PID: ${child.pid}). Logs: ${logFile}`);
