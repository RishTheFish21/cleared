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
  if (!res.ok) {
    // OAuth errors use {error, error_description}, not the {name, message} shape of other endpoints.
    const why = body.error_description || body.error || 'unknown error';
    throw new PayPalError(`PayPal login failed: ${why}. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET`, res.status, body);
  }
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

// ---------- Invoicing v2 ----------

const idFromHref = (href) => href?.split('/').pop();
// Invoicing v2 names the field currency_code; Payouts v1 uses currency.
const invMoney = (cents) => ({ value: (cents / 100).toFixed(2), currency_code: 'USD' });

/** Create a draft invoice and return its PayPal id. */
export async function createInvoice({ requestId, recipientEmail, recipientName, itemName, itemDescription, amountCents, note }) {
  const { invoice_number } = await paypal('/v2/invoicing/generate-next-invoice-number', { method: 'POST' });
  const res = await paypal('/v2/invoicing/invoices', {
    method: 'POST',
    requestId,
    body: {
      detail: {
        currency_code: 'USD',
        invoice_number,
        note,
        payment_term: { term_type: 'DUE_ON_RECEIPT' },
      },
      primary_recipients: [{ billing_info: { email_address: recipientEmail, ...(recipientName ? { business_name: recipientName } : {}) } }],
      items: [{ name: itemName, description: itemDescription, quantity: '1', unit_amount: invMoney(amountCents), unit_of_measure: 'AMOUNT' }],
      configuration: { allow_tip: false, tax_inclusive: false },
    },
  });
  return { paypalId: res.id ?? idFromHref(res.href), invoiceNumber: invoice_number };
}

export const sendInvoice = (paypalId) =>
  paypal(`/v2/invoicing/invoices/${paypalId}/send`, { method: 'POST', body: { send_to_invoicer: false, send_to_recipient: true } });

export const getInvoice = (paypalId) => paypal(`/v2/invoicing/invoices/${paypalId}`);

/** Record a payment received outside PayPal (e.g. bank transfer). */
export const recordInvoicePayment = (paypalId, amountCents, method = 'BANK_TRANSFER') =>
  paypal(`/v2/invoicing/invoices/${paypalId}/payments`, {
    method: 'POST',
    body: { method, payment_date: new Date().toISOString().slice(0, 10), amount: invMoney(amountCents), note: 'Recorded in Cleared' },
  });
