import { useEffect, useState } from 'react';
import { api, money } from './api.js';

const OPEN = ['CREATING', 'DRAFT', 'SENT', 'SCHEDULED', 'PARTIALLY_PAID', 'UNPAID'];

/**
 * Brand funding via PayPal Invoicing. Creators are only ever paid from money the
 * brand has already paid, so this sits at the top of the campaign until it's done.
 */
export default function FundingBanner({ campaign, onChange }) {
  const open = campaign.invoices?.find((i) => OPEN.includes(i.status));
  const outstanding = Math.max(campaign.budget_cents - campaign.funded_cents, 0);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  // Pre-fill the sandbox account in the public demo (only sandbox emails are allowed there).
  useEffect(() => {
    if (!form || form.email) return;
    api('/health')
      .then((h) => h.demoReceiver && setForm((f) => (f && !f.email ? { ...f, email: h.demoReceiver } : f)))
      .catch(() => {});
  }, [form]);

  if (!open && outstanding === 0) return null;

  const run = async (name, fn) => {
    setBusy(name);
    setErr(null);
    try {
      await fn();
      await onChange();
      setForm(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const send = (e) => {
    e.preventDefault();
    run('send', () =>
      api(`/campaigns/${campaign.id}/invoice`, {
        method: 'POST',
        body: { recipient_email: form.email.trim(), amount_cents: Math.round(Number(form.amount) * 100) },
      }),
    );
  };

  return (
    <div className="funding" role="region" aria-label="Funding">
      <div style={{ flex: 1, minWidth: 0 }}>
        {open ? (
          <>
            <div className="funding-title">
              PayPal invoice #{open.invoice_number} sent to {campaign.brand} for <span className="num">{money(open.amount_cents)}</span>
            </div>
            <div className="muted small">
              Waiting for payment. Checks keep running; payouts start the moment the invoice is paid.
            </div>
          </>
        ) : form ? (
          <form className="funding-form" onSubmit={send}>
            <input
              className="input"
              type="email"
              required
              placeholder="brand@example.com"
              aria-label="Brand's PayPal email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              className="input"
              type="number"
              min="1"
              step="0.01"
              required
              aria-label="Amount in USD"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              style={{ maxWidth: 130 }}
            />
            <button className="btn btn-primary" disabled={!!busy}>
              {busy === 'send' ? 'Sending…' : 'Send invoice'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div className="funding-title">{campaign.funded_cents ? `${money(outstanding)} of the budget still to collect` : 'Not funded yet'}</div>
            <div className="muted small">Creators are only paid from money the brand has already paid. Bill them up front with a PayPal invoice.</div>
          </>
        )}
        {err && <div className="error-text">{err}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {open ? (
          <>
            {open.pay_url && (
              <a className="btn btn-sm" href={open.pay_url} target="_blank" rel="noreferrer">
                Open invoice ↗
              </a>
            )}
            <button className="btn btn-sm" disabled={!!busy} onClick={() => run('mark', () => api(`/invoices/${open.id}/mark-paid`, { method: 'POST' }))}>
              {busy === 'mark' ? 'Recording…' : 'Brand paid by bank transfer'}
            </button>
          </>
        ) : (
          !form && (
            <button className="btn btn-primary" onClick={() => setForm({ email: '', amount: (outstanding / 100).toFixed(2) })}>
              Invoice brand with PayPal
            </button>
          )
        )}
      </div>
    </div>
  );
}
