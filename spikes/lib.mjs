import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');

/** Exit with a clear message if any env var is missing. */
export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`\n✗ Missing in .env: ${missing.join(', ')}  (see .env.example)\n`);
    process.exit(2);
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n]]));
}

/** Accepts a full YouTube URL or a bare 11-char ID. */
export function youtubeId(input) {
  if (/^[\w-]{11}$/.test(input)) return input;
  const url = new URL(input);
  if (url.hostname === 'youtu.be') return url.pathname.slice(1, 12);
  if (url.searchParams.get('v')) return url.searchParams.get('v');
  const m = url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/);
  if (m) return m[1];
  throw new Error(`Can't find a video ID in ${input}`);
}

/** Save raw responses so we can inspect them later. */
export function saveOutput(name, data) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, name);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

export const pass = (msg) => console.log(`\n✓ PASS  ${msg}\n`);
export const fail = (msg) => {
  console.log(`\n✗ FAIL  ${msg}\n`);
  process.exitCode = 1;
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
