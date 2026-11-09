// Runs the API server (auto-restart) and the Vite dev server together.
import { spawn } from 'node:child_process';

// The API always runs on 3000 (Vite proxies /api to it). PORT, if set, is for the web server.
const WEB_PORT = process.env.PORT || '5173';

const run = (name, args, env = {}) => {
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  const tag = (chunk) => chunk.toString().split('\n').filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
  p.stdout.on('data', (c) => process.stdout.write(tag(c)));
  p.stderr.on('data', (c) => process.stderr.write(tag(c)));
  return p;
};

const procs = [
  // --watch follows imported files; --watch-path restart-loops on macOS.
  run('api', ['--env-file-if-exists=.env', '--watch', 'server/index.js'], { PORT: '3000' }),
  run('web', ['node_modules/vite/bin/vite.js', '--port', WEB_PORT, '--strictPort']),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
