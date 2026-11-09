// Runs all three go/no-go tests in order and prints a summary.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tests = [
  ['PayPal sandbox payout', 'paypal-payout.mjs'],
  ['YouTube paid-promotion flag', 'youtube-flag.mjs'],
  ['Gemini disclosure verdict', 'gemini-disclosure.mjs'],
];

const results = tests.map(([name, file]) => {
  console.log(`\n================ ${name} ================`);
  const r = spawnSync(process.execPath, [join(here, file)], { stdio: 'inherit', env: process.env });
  return [name, r.status === 0 ? 'PASS' : r.status === 2 ? 'NOT CONFIGURED' : 'FAIL'];
});

console.log('\n================ Summary ================');
for (const [name, s] of results) console.log(`  ${s.padEnd(15)} ${name}`);
