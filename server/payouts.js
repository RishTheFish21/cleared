// Sends creator payouts and tracks them to a final state by polling.
// We poll instead of waiting on webhooks because sandbox webhooks can lag by hours.
import { createPayout, getPayoutBatch } from './paypal.js';
import { config } from './config.js';
import { checkReceiver } from './guards.js';
import { one, all, insert, update, newId, now, logEvent } from './db.js';

const PENDING = new Set(['CREATED', 'SUBMITTED', 'PENDING', 'ONHOLD', 'PROCESSING']);
const fmt = (c) => `$${(c / 100).toFixed(2)}`;

/**
 * Pay a verified deliverable. Safe to call twice: the payouts table allows one
 * row per deliverable, and PayPal dedupes on the request id.
 */
export async function payDeliverable(deliverableId, amountCents) {
  const d = one(
    `SELECT d.*, c.paypal_email, c.name AS creator_name, k.brand
       FROM deliverables d JOIN creators c ON c.id = d.creator_id JOIN campaigns k ON k.id = d.campaign_id
      WHERE d.id = ?`,
    deliverableId,
  );
  if (!d) throw new Error(`No deliverable ${deliverableId}`);
  checkReceiver(d.paypal_email);
  if (amountCents > config.limits.maxPayoutCents) throw new Error(`Amount ${fmt(amountCents)} is over the per-deliverable cap`);

  let payout = one('SELECT * FROM payouts WHERE deliverable_id = ?', deliverableId);
  if (payout?.batch_id) return payout; // already sent
  if (!payout) {
    payout = insert('payouts', { id: newId('po'), deliverable_id: d.id, amount_cents: amountCents, receiver: d.paypal_email });
  }

  update('deliverables', d.id, { status: 'paying' });
  logEvent({
    campaignId: d.campaign_id,
    deliverableId: d.id,
    type: 'payout.sending',
    message: `Sending ${fmt(amountCents)} to ${d.creator_name} via PayPal Payouts`,
  });

  try {
    const res = await createPayout({
      id: payout.id,
      receiver: d.paypal_email,
      amountCents,
      subject: `${d.brand} paid you for "${d.title}"`,
      message: 'Your sponsored post passed its compliance check. Payment sent by Cleared.',
      note: `Cleared deliverable ${d.id}`,
    });
    const batch = res.batch_header;
    update('payouts', payout.id, { batch_id: batch.payout_batch_id, status: batch.batch_status, raw: res });
    logEvent({
      campaignId: d.campaign_id,
      deliverableId: d.id,
      type: 'payout.created',
      message: `PayPal accepted payout batch ${batch.payout_batch_id}`,
      data: { batchId: batch.payout_batch_id },
    });
  } catch (err) {
    update('payouts', payout.id, { status: 'ERROR', raw: err.body ?? { message: err.message } });
    update('deliverables', d.id, { status: 'payout_failed' });
    logEvent({ campaignId: d.campaign_id, deliverableId: d.id, type: 'payout.error', message: err.message });
    throw err;
  }
  return one('SELECT * FROM payouts WHERE id = ?', payout.id);
}

/** Check one in-flight payout and move the deliverable to paid/failed when it settles. */
export async function refreshPayout(payout) {
  const res = await getPayoutBatch(payout.batch_id);
  const item = res.items?.[0];
  const status = item?.transaction_status ?? res.batch_header.batch_status;
  if (status === payout.status) return status;

  update('payouts', payout.id, { status, item_id: item?.payout_item_id ?? null, raw: res });
  const d = one('SELECT * FROM deliverables WHERE id = ?', payout.deliverable_id);

  if (status === 'SUCCESS' || status === 'UNCLAIMED') {
    update('deliverables', d.id, { status: 'paid', paid_at: now() });
    const secs = d.verified_at ? Math.round((Date.now() - Date.parse(d.verified_at)) / 1000) : null;
    logEvent({
      campaignId: d.campaign_id,
      deliverableId: d.id,
      type: 'payout.paid',
      message:
        status === 'SUCCESS'
          ? `Paid ${fmt(payout.amount_cents)}${secs != null ? `, ${secs}s after verification` : ''}`
          : `Sent ${fmt(payout.amount_cents)}; waiting for the creator to claim it`,
      data: { status, transactionId: item?.transaction_id, secondsAfterVerification: secs },
    });
  } else if (!PENDING.has(status)) {
    update('deliverables', d.id, { status: 'payout_failed' });
    logEvent({
      campaignId: d.campaign_id,
      deliverableId: d.id,
      type: 'payout.failed',
      message: `Payout ended as ${status}${item?.errors?.message ? `: ${item.errors.message}` : ''}`,
    });
  }
  return status;
}

/** Called on a timer: refresh every payout that hasn't settled. */
export async function pollPendingPayouts() {
  const pending = all(
    `SELECT * FROM payouts WHERE batch_id IS NOT NULL AND status IN (${[...PENDING].map(() => '?').join(',')})`,
    ...PENDING,
  );
  for (const p of pending) {
    try {
      await refreshPayout(p);
    } catch (err) {
      console.error(`poll ${p.id}: ${err.message}`);
    }
  }
}
