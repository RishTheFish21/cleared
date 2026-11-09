// The agency bills the brand up front with a PayPal invoice. When PayPal reports it paid,
// the campaign's funded balance goes up, and only then can creators be paid from it.
import { createInvoice, sendInvoice, getInvoice, recordInvoicePayment } from './paypal.js';
import { one, all, insert, update, newId, logEvent, db } from './db.js';

const OPEN = ['CREATING', 'DRAFT', 'SENT', 'SCHEDULED', 'PARTIALLY_PAID', 'UNPAID'];
// PAID = paid through PayPal; MARKED_AS_PAID = payment recorded from outside PayPal (e.g. bank transfer).
const PAID = ['PAID', 'MARKED_AS_PAID'];
const fmt = (c) => `$${(c / 100).toFixed(2)}`;

export async function invoiceBrand({ campaignId, recipientEmail, amountCents }) {
  const c = one('SELECT * FROM campaigns WHERE id = ?', campaignId);
  if (!c) throw new Error(`No campaign ${campaignId}`);
  const open = one(`SELECT id FROM invoices WHERE campaign_id = ? AND status IN (${OPEN.map(() => '?').join(',')})`, c.id, ...OPEN);
  if (open) throw Object.assign(new Error('This campaign already has an unpaid invoice'), { status: 409 });

  const inv = insert('invoices', { id: newId('inv'), campaign_id: c.id, recipient_email: recipientEmail, amount_cents: amountCents });
  try {
    const { paypalId, invoiceNumber } = await createInvoice({
      requestId: inv.id,
      recipientEmail,
      recipientName: c.brand,
      itemName: `Creator campaign: ${c.name}`,
      itemDescription: 'Creator fees, paid out after each post passes its compliance check',
      amountCents,
      note: 'Funds are held for this campaign and paid to creators as their posts are verified.',
    });
    update('invoices', inv.id, { paypal_id: paypalId, invoice_number: invoiceNumber, status: 'DRAFT' });
    await sendInvoice(paypalId);
    const full = await getInvoice(paypalId);
    update('invoices', inv.id, { status: full.status, pay_url: full.detail?.metadata?.recipient_view_url ?? null, raw: full });
    logEvent({ campaignId: c.id, type: 'invoice.sent', message: `PayPal invoice #${invoiceNumber} for ${fmt(amountCents)} sent to ${c.brand}` });
  } catch (err) {
    update('invoices', inv.id, { status: 'ERROR', raw: err.body ?? { message: err.message } });
    logEvent({ campaignId: c.id, type: 'invoice.error', message: `Couldn't create invoice: ${err.message}` });
    throw err;
  }
  return one('SELECT * FROM invoices WHERE id = ?', inv.id);
}

/** Pull the latest status from PayPal and credit the campaign once when paid. Returns true if it credited. */
export async function refreshInvoice(inv) {
  let credited = false;
  const full = await getInvoice(inv.paypal_id);
  const paidCents = Math.round(Number(full.payments?.paid_amount?.value ?? 0) * 100);
  if (full.status !== inv.status) update('invoices', inv.id, { status: full.status, raw: full });

  if (PAID.includes(full.status) && !inv.credited) {
    // Mark credited and add funds in one transaction so a crash can't double-count.
    db.exec('BEGIN');
    try {
      const fresh = one('SELECT credited FROM invoices WHERE id = ?', inv.id);
      if (!fresh.credited) {
        const amount = paidCents || inv.amount_cents;
        update('invoices', inv.id, { credited: 1 });
        db.prepare('UPDATE campaigns SET funded_cents = funded_cents + ? WHERE id = ?').run(amount, inv.campaign_id);
        db.exec('COMMIT');
        credited = true;
        const via = full.payments?.transactions?.[0]?.method;
        logEvent({
          campaignId: inv.campaign_id,
          type: 'funds.received',
          message: `Brand paid invoice #${inv.invoice_number}: ${fmt(amount)} now available for creators${via && via !== 'PAYPAL' ? ` (${via.toLowerCase().replace('_', ' ')})` : ''}`,
        });
      } else db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return credited;
}

/** For brands that pay by bank transfer: record it on the PayPal invoice, which marks it paid. */
export async function markInvoicePaidExternally(invoiceId) {
  const inv = one('SELECT * FROM invoices WHERE id = ?', invoiceId);
  if (!inv?.paypal_id) throw new Error(`No invoice ${invoiceId}`);
  // Already paid (maybe through PayPal while this button sat on screen): just sync, don't record twice.
  const current = await getInvoice(inv.paypal_id);
  if (!PAID.includes(current.status)) await recordInvoicePayment(inv.paypal_id, inv.amount_cents);
  const credited = await refreshInvoice(one('SELECT * FROM invoices WHERE id = ?', invoiceId));
  return { invoice: one('SELECT * FROM invoices WHERE id = ?', invoiceId), credited };
}

/** Returns the ids of campaigns that just received funds. */
export async function pollOpenInvoices() {
  const marks = (list) => list.map(() => '?').join(',');
  const open = all(
    `SELECT * FROM invoices WHERE paypal_id IS NOT NULL AND (status IN (${marks(OPEN)}) OR (status IN (${marks(PAID)}) AND credited = 0))`,
    ...OPEN,
    ...PAID,
  );
  const funded = new Set();
  for (const inv of open) {
    try {
      if (await refreshInvoice(inv)) funded.add(inv.campaign_id);
    } catch (err) {
      console.error(`invoice ${inv.id}: ${err.message}`);
    }
  }
  return [...funded];
}
