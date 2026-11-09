import { lazy, Suspense, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { money, usePolling, fmtDay } from './api.js';
import { StatusPill, Empty } from './ui.jsx';
const Timeline = lazy(() => import('./Timeline.jsx'));
import ActivityFeed from './ActivityFeed.jsx';
import DeliverableDrawer from './DeliverableDrawer.jsx';
import AddDeliverable from './AddDeliverable.jsx';
import ChecklistCard from './ChecklistCard.jsx';
import FundingBanner from './FundingBanner.jsx';

export default function CampaignPage() {
  const { id } = useParams();
  const { data: c, error, refresh } = usePolling(`/campaigns/${id}`, 2000);
  const [params, setParams] = useSearchParams();
  const selected = params.get('d');
  const select = (dId) => setParams(dId ? { d: dId } : {}, { replace: false });
  const [adding, setAdding] = useState(false);

  const creatorNames = useMemo(() => Object.fromEntries((c?.deliverables ?? []).map((d) => [d.id, d.creator_name])), [c]);

  if (error && !c) return <div className="page"><p className="error-text">{error}</p></div>;
  if (!c) return <div className="page muted">Loading…</div>;

  const ds = c.deliverables;
  const attention = ds.filter((d) => ['fix_needed', 'human_review', 'payout_failed'].includes(d.status)).length;
  const paidCount = ds.filter((d) => d.status === 'paid').length;
  const committed = ds.reduce((s, d) => s + d.fee_cents, 0);

  const paidInvoice = c.invoices?.find((i) => i.status === 'PAID');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="brand-line">{c.brand}</div>
          <h1>{c.name}</h1>
          {c.checklist?.summary && <div className="sub">{c.checklist.summary}</div>}
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          + Add deliverable
        </button>
      </div>

      <FundingBanner campaign={c} onChange={refresh} />

      <div className="ledger" aria-label="Campaign money">
        <LedgerCell label="Brand paid in" value={money(c.funded_cents)} sub={paidInvoice ? `PayPal invoice #${paidInvoice.invoice_number}` : `of ${money(c.budget_cents)} budget`} />
        <span className="ledger-op" aria-hidden>−</span>
        <LedgerCell label="Paid to creators" value={money(c.paid_cents)} sub={`${paidCount} of ${ds.length} deliverables`} />
        <span className="ledger-op" aria-hidden>=</span>
        <LedgerCell label="Held for creators" value={money(c.funded_cents - c.paid_cents)} sub="Only paid out once a post clears" />
        <LedgerCell
          split
          label="Still owed"
          value={money(committed - c.paid_cents)}
          warn={committed > c.funded_cents}
          sub={committed > c.funded_cents ? `${money(committed - c.funded_cents)} more than funded` : 'Covered by funds received'}
        />
        <LedgerCell split label="Needs attention" value={attention} warn={attention > 0} sub={attention ? 'Fixes or reviews pending' : 'All clear'} />
      </div>

      <div className="card timeline-card">
        <div className="card-head">
          <h2>Timeline</h2>
          <div className="legend">
            {['due', 'verifying', 'fix_needed', 'human_review', 'paid'].map((s) => (
              <StatusPill key={s} status={s === 'verifying' ? 'checking' : s} />
            ))}
          </div>
        </div>
        {ds.length ? <Suspense fallback={<div className="timeline-wrap" />}><Timeline deliverables={ds} onSelect={select} /></Suspense> : <Empty title="No deliverables yet">Add a creator and the post they owe.</Empty>}
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2>Deliverables</h2>
            </div>
            {ds.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Creator</th>
                    <th>Deliverable</th>
                    <th>Due</th>
                    <th className="num">Fee</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ds.map((d) => (
                    <tr key={d.id} className="clickable" onClick={() => select(d.id)}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{d.creator_name}</div>
                        {d.creator_handle && <div className="muted small">{d.creator_handle}</div>}
                      </td>
                      <td>{d.title}</td>
                      <td className="mono muted">{fmtDay(d.due_date)}</td>
                      <td className="num">{money(d.fee_cents)}</td>
                      <td>
                        <StatusPill status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty title="Nothing to track yet" />
            )}
          </div>
          <ChecklistCard checklist={c.checklist} brief={c.brief_text} />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Agent activity</h2>
            <span className="live">live</span>
          </div>
          <ActivityFeed campaignId={c.id} creatorNames={creatorNames} onSelect={select} />
        </div>
      </div>

      {selected && <DeliverableDrawer id={selected} onClose={() => select(null)} />}
      {adding && <AddDeliverable campaign={c} onClose={() => setAdding(false)} onAdded={refresh} />}
    </div>
  );
}

function LedgerCell({ label, value, sub, warn, split }) {
  return (
    <div className={`ledger-cell${split ? ' split' : ''}`}>
      <div className="ledger-label">{label}</div>
      <div className={`ledger-value${warn ? ' warn' : ''}`}>{value}</div>
      {sub && <div className="ledger-sub">{sub}</div>}
    </div>
  );
}
