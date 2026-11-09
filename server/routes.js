import { Router } from 'express';
import { parseBrief } from './brief.js';
import { submitPost, recheckNow, approve, reject, releaseHeld } from './pipeline.js';
import { invoiceBrand, markInvoicePaidExternally } from './invoices.js';
import { youtubeId } from './youtube.js';
import { one, all, insert, update, newId } from './db.js';
import { checkReceiver } from './guards.js';
import { seedDemo } from './seed.js';
import { config } from './config.js';

export const api = Router();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = (what) => new HttpError(404, `${what} not found`);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((out) => out !== undefined && res.json(out), next);

function str(body, key, { max = 5000, optional = false } = {}) {
  const v = body?.[key];
  if (v == null || v === '') {
    if (optional) return null;
    throw bad(`${key} is required`);
  }
  if (typeof v !== 'string' || v.length > max) throw bad(`${key} must be text under ${max} characters`);
  return v.trim();
}
function cents(body, key) {
  const v = Number(body?.[key]);
  if (!Number.isInteger(v) || v < 0 || v > 10_000_000) throw bad(`${key} must be a whole number of cents`);
  return v;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- campaigns ----------

api.get(
  '/campaigns',
  wrap(() =>
    all(
      `SELECT k.id, k.name, k.brand, k.budget_cents, k.funded_cents, k.created_at,
              COUNT(d.id) AS deliverable_count,
              COALESCE(SUM(d.status = 'paid'), 0) AS paid_count
         FROM campaigns k LEFT JOIN deliverables d ON d.campaign_id = k.id
        GROUP BY k.id ORDER BY k.created_at DESC, k.rowid DESC`,
    ),
  ),
);

api.post(
  '/campaigns',
  wrap(async (req) => {
    const name = str(req.body, 'name', { max: 120 });
    const brand = str(req.body, 'brand', { max: 80 });
    const brief = str(req.body, 'brief_text', { max: 5000 });
    const budget = cents(req.body, 'budget_cents');
    const checklist = await parseBrief({ brand, briefText: brief });
    return insert('campaigns', { id: newId('cmp'), name, brand, brief_text: brief, budget_cents: budget, checklist });
  }),
);

api.get(
  '/campaigns/:id',
  wrap((req) => {
    const c = one('SELECT * FROM campaigns WHERE id = ?', req.params.id);
    if (!c) throw notFound('Campaign');
    const deliverables = all(
      `SELECT d.*, cr.name AS creator_name, cr.handle AS creator_handle, p.status AS payout_status, p.batch_id
         FROM deliverables d JOIN creators cr ON cr.id = d.creator_id LEFT JOIN payouts p ON p.deliverable_id = d.id
        WHERE d.campaign_id = ? ORDER BY d.due_date`,
      c.id,
    );
    const paid = deliverables.filter((d) => d.status === 'paid').reduce((s, d) => s + d.fee_cents, 0);
    const invoices = all(
      'SELECT id, invoice_number, recipient_email, amount_cents, status, pay_url, credited, created_at FROM invoices WHERE campaign_id = ? ORDER BY created_at DESC, rowid DESC',
      c.id,
    );
    return { ...c, deliverables, invoices, paid_cents: paid };
  }),
);

/** Re-run the brief parser, e.g. after editing the brief. */
api.post(
  '/campaigns/:id/checklist',
  wrap(async (req) => {
    const c = one('SELECT * FROM campaigns WHERE id = ?', req.params.id);
    if (!c) throw notFound('Campaign');
    const brief = str(req.body, 'brief_text', { optional: true }) ?? c.brief_text;
    const checklist = await parseBrief({ brand: c.brand, briefText: brief });
    update('campaigns', c.id, { brief_text: brief, checklist });
    return { checklist };
  }),
);

// ---------- brand funding (PayPal Invoicing) ----------

api.post(
  '/campaigns/:id/invoice',
  wrap(async (req) => {
    const c = one('SELECT * FROM campaigns WHERE id = ?', req.params.id);
    if (!c) throw notFound('Campaign');
    const email = str(req.body, 'recipient_email', { max: 200 });
    if (!EMAIL.test(email)) throw bad('recipient_email must be an email address');
    checkReceiver(email);
    const amount = cents(req.body, 'amount_cents');
    if (amount < 100) throw bad('Invoice at least $1');
    return invoiceBrand({ campaignId: c.id, recipientEmail: email, amountCents: amount });
  }),
);

/** The brand paid another way (e.g. bank transfer): record it on the PayPal invoice. */
api.post(
  '/invoices/:id/mark-paid',
  wrap(async (req) => {
    // The worker may credit it first; releasing held payouts is safe to run either way.
    const { invoice } = await markInvoicePaidExternally(req.params.id);
    if (invoice.credited) await releaseHeld(invoice.campaign_id);
    return invoice;
  }),
);

// ---------- creators ----------

api.get('/creators', wrap(() => all('SELECT * FROM creators ORDER BY name')));

api.post(
  '/creators',
  wrap((req) => {
    const name = str(req.body, 'name', { max: 80 });
    const email = str(req.body, 'paypal_email', { max: 200 });
    if (!EMAIL.test(email)) throw bad('paypal_email must be an email address');
    checkReceiver(email);
    return insert('creators', { id: newId('cr'), name, handle: str(req.body, 'handle', { max: 80, optional: true }), paypal_email: email });
  }),
);

// ---------- deliverables ----------

api.post(
  '/campaigns/:id/deliverables',
  wrap((req) => {
    const c = one('SELECT * FROM campaigns WHERE id = ?', req.params.id);
    if (!c) throw notFound('Campaign');
    const creatorId = str(req.body, 'creator_id', { max: 40 });
    if (!one('SELECT id FROM creators WHERE id = ?', creatorId)) throw notFound('Creator');
    const due = str(req.body, 'due_date', { max: 30 });
    if (Number.isNaN(Date.parse(due))) throw bad('due_date must be a date');
    return insert('deliverables', {
      id: newId('dl'),
      campaign_id: c.id,
      creator_id: creatorId,
      title: str(req.body, 'title', { max: 120 }),
      due_date: due,
      fee_cents: cents(req.body, 'fee_cents'),
    });
  }),
);

api.get(
  '/deliverables/:id',
  wrap((req) => {
    const d = one(
      `SELECT d.*, cr.name AS creator_name, cr.handle AS creator_handle, k.name AS campaign_name, k.brand, k.checklist,
              k.funded_cents AS campaign_funded_cents
         FROM deliverables d JOIN creators cr ON cr.id = d.creator_id JOIN campaigns k ON k.id = d.campaign_id
        WHERE d.id = ?`,
      req.params.id,
    );
    if (!d) throw notFound('Deliverable');
    return {
      ...d,
      latest_check: one('SELECT * FROM checks WHERE deliverable_id = ? AND finished_at IS NOT NULL ORDER BY started_at DESC, rowid DESC LIMIT 1', d.id),
      payout: one('SELECT id, amount_cents, receiver, batch_id, item_id, status, created_at, updated_at FROM payouts WHERE deliverable_id = ?', d.id),
      events: all('SELECT * FROM events WHERE deliverable_id = ? ORDER BY id', d.id),
    };
  }),
);

api.post(
  '/deliverables/:id/submit',
  wrap((req) => {
    const url = str(req.body, 'post_url', { max: 300 });
    if (!youtubeId(url)) throw bad('post_url must be a YouTube video link');
    submitPost(req.params.id, url);
    return { ok: true };
  }),
);

api.post('/deliverables/:id/recheck', wrap((req) => (recheckNow(req.params.id), { ok: true })));
api.post('/deliverables/:id/approve', wrap(async (req) => (await approve(req.params.id, str(req.body, 'note', { optional: true, max: 500 }) ?? ''), { ok: true })));
api.post('/deliverables/:id/reject', wrap((req) => (reject(req.params.id, str(req.body, 'message', { max: 1000 })), { ok: true })));

// ---------- demo ----------

api.post(
  '/demo/reset',
  wrap(() => {
    if (!config.demo.enabled) throw new HttpError(404, 'Not available');
    const c = seedDemo({ receiver: config.demo.receiver });
    return { campaignId: c.id };
  }),
);

// ---------- activity feed ----------

api.get(
  '/events',
  wrap((req) => {
    const since = Number(req.query.since) || 0;
    const campaign = typeof req.query.campaign_id === 'string' ? req.query.campaign_id : null;
    return campaign
      ? all('SELECT * FROM events WHERE id > ? AND campaign_id = ? ORDER BY id LIMIT 200', since, campaign)
      : all('SELECT * FROM events WHERE id > ? ORDER BY id LIMIT 200', since);
  }),
);

// Errors from the pipeline ("already paid", "no deliverable") become 400/404 instead of 500.
api.use((err, _req, res, _next) => {
  const status = err.status ?? (/^No |not found/i.test(err.message) ? 404 : /already|Can only|No post/i.test(err.message) ? 409 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});
