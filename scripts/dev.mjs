// Runs the API server (auto-restart) and the Vite dev server together.
import { spawn } from 'node:child_process';

const run = (name, args) => {
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = (chunk) => chunk.toString().split('\n').filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
  p.stdout.on('data', (c) => process.stdout.write(tag(c)));
  p.stderr.on('data', (c) => process.stderr.write(tag(c)));
  return p;
};

const procs = [
  run('api', ['--env-file-if-exists=.env', '--watch-path=server', 'server/index.js']),
  run('web', ['node_modules/vite/bin/vite.js']),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
