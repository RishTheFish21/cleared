// Test 1: can we send a sandbox payout and see it complete by polling?
// Passes when the payout item reaches SUCCESS (or UNCLAIMED, which still proves Payouts works).
import { randomUUID } from 'node:crypto';
import { requireEnv, saveOutput, pass, fail, sleep } from './lib.mjs';

const API = 'https://api-m.sandbox.paypal.com';
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_TEST_RECEIVER } = requireEnv(
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_TEST_RECEIVER',
);

async function getToken() {
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`OAuth failed (${res.status}): ${JSON.stringify(body)}`);
  const scopes = body.scope?.split(' ') ?? [];
  const hasPayouts = scopes.some((s) => s.includes('payments/payouts'));
  console.log(`• Got access token. Payouts scope present: ${hasPayouts ? 'yes' : 'NO'}`);
  return body.access_token;
}

async function api(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body, debugId: res.headers.get('paypal-debug-id') };
}

const token = await getToken();

const deliverableId = `spike-${Date.now()}`;
const create = await api(token, '/v1/payments/payouts', {
  method: 'POST',
  headers: { 'PayPal-Request-Id': randomUUID() },
  body: JSON.stringify({
    sender_batch_header: {
      sender_batch_id: deliverableId,
      email_subject: 'Cleared: your sponsored post was verified',
      email_message: 'Your post passed compliance. Payment sent.',
    },
    items: [
      {
        recipient_type: 'EMAIL',
        receiver: PAYPAL_TEST_RECEIVER,
        amount: { value: '1.00', currency: 'USD' },
        sender_item_id: deliverableId,
        note: 'Cleared spike test',
      },
    ],
  }),
});

if (!create.ok) {
  saveOutput('paypal-payout-error.json', create);
  const name = create.body?.name;
  console.log(JSON.stringify(create.body, null, 2));
  if (name === 'AUTHORIZATION_ERROR' || create.status === 403) {
    fail(
      'Payouts is not enabled for this sandbox app/account.\n' +
        '        Fix: developer.paypal.com -> your sandbox app -> Features -> tick "Payouts", save.\n' +
        '        It can take a while to activate. If it still fails, ask on the hackathon Discord with debug id ' +
        create.debugId,
    );
  } else if (name === 'INSUFFICIENT_FUNDS') {
    fail('Sandbox business account has no balance. Top it up in Sandbox Accounts -> Add funds.');
  } else {
    fail(`Create payout returned ${create.status} ${name ?? ''} (debug id ${create.debugId})`);
  }
  process.exit();
}

const batchId = create.body.batch_header.payout_batch_id;
console.log(`• Payout batch created: ${batchId} (status ${create.body.batch_header.batch_status})`);

// Poll instead of relying on webhooks (sandbox webhooks can lag by hours).
const started = Date.now();
let item;
for (let i = 0; i < 30; i++) {
  const get = await api(token, `/v1/payments/payouts/${batchId}`);
  const batchStatus = get.body.batch_header?.batch_status;
  item = get.body.items?.[0];
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  ${elapsed}s  batch=${batchStatus}  item=${item?.transaction_status ?? '-'}`);
  if (item && !['PENDING', 'ONHOLD', undefined].includes(item.transaction_status)) break;
  await sleep(2000);
}

const file = saveOutput('paypal-payout.json', { batchId, item });
console.log(`• Raw response saved to ${file}`);
const status = item?.transaction_status;
const secs = ((Date.now() - started) / 1000).toFixed(1);

if (status === 'SUCCESS') pass(`Payout of $1.00 reached ${PAYPAL_TEST_RECEIVER} in ${secs}s (polling).`);
else if (status === 'UNCLAIMED')
  pass(
    `Payouts works, but ${PAYPAL_TEST_RECEIVER} isn't a sandbox account, so the money is UNCLAIMED.\n` +
      '        Use a sandbox personal account email so the demo shows SUCCESS.',
  );
else fail(`Payout item ended as ${status ?? 'unknown'} after ${secs}s. Check ${file}.`);
