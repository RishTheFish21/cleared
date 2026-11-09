// Thin PayPal REST client (sandbox by default). No SDK: just fetch + OAuth.
import { config } from './config.js';

let cached = { token: null, expiresAt: 0 };

async function getToken() {
  if (cached.token && Date.now() < cached.expiresAt - 60_000) return cached.token;
  const { clientId, clientSecret, apiBase } = config.paypal;
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json();
  if (!res.ok) throw new PayPalError('OAuth failed', res.status, body);
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

export class PayPalError extends Error {
  constructor(message, status, body, debugId) {
    super(`${message} (${status} ${body?.name ?? ''}${debugId ? `, debug id ${debugId}` : ''})`);
    this.status = status;
    this.body = body;
    this.debugId = debugId;
  }
}

export async function paypal(path, { method = 'GET', body, requestId } = {}) {
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (requestId) headers['PayPal-Request-Id'] = requestId; // makes retries safe
  const res = await fetch(`${config.paypal.apiBase}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new PayPalError(`PayPal ${method} ${path} failed`, res.status, json, res.headers.get('paypal-debug-id'));
  return json;
}

const money = (cents) => ({ value: (cents / 100).toFixed(2), currency: 'USD' });

/** Send one payout. `id` is our payout row id, used for idempotency. */
export function createPayout({ id, receiver, amountCents, subject, message, note }) {
  return paypal('/v1/payments/payouts', {
    method: 'POST',
    requestId: id,
    body: {
      sender_batch_header: { sender_batch_id: id, email_subject: subject, email_message: message },
      items: [{ recipient_type: 'EMAIL', receiver, amount: money(amountCents), sender_item_id: id, note }],
    },
  });
}

export const getPayoutBatch = (batchId) => paypal(`/v1/payments/payouts/${batchId}`);
