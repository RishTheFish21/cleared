import { Link } from 'react-router-dom';

// One place that defines how each status looks and reads.
export const STATUS = {
  due: { label: 'Due', tone: 'gray', bryntum: 'gray' },
  submitted: { label: 'Queued', tone: 'blue', bryntum: 'blue' },
  verifying: { label: 'Checking', tone: 'violet', bryntum: 'violet' },
  fix_needed: { label: 'Fix needed', tone: 'amber', bryntum: 'orange' },
  human_review: { label: 'Needs review', tone: 'amber', bryntum: 'yellow' },
  verified: { label: 'Verified', tone: 'green', bryntum: 'teal' },
  paying: { label: 'Paying', tone: 'green', bryntum: 'teal' },
  paid: { label: 'Paid', tone: 'green', bryntum: 'green' },
  payout_failed: { label: 'Payout failed', tone: 'red', bryntum: 'red' },
  checking: { label: 'Checking', tone: 'violet' }, // legend swatch without the spinner
};

export function StatusPill({ status }) {
  const s = STATUS[status] ?? { label: status, tone: 'gray' };
  const busy = status === 'verifying' || status === 'paying' || status === 'submitted';
  return (
    <span className={`pill pill-${s.tone}`}>
      {busy ? <span className="spinner" aria-hidden /> : <span className="dot" aria-hidden />}
      {s.label}
    </span>
  );
}

export function Logo({ to = '/' }) {
  return (
    <Link to={to} className="logo" aria-label="Cleared home">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--ink)" />
        <path d="M9 16.5l4.5 4.5L23 11" stroke="var(--green-bright)" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Cleared</span>
    </Link>
  );
}

const ICON = { met: '✓', not_met: '✕', unsure: '?' };
export function CheckIcon({ status }) {
  return (
    <span className={`check-icon check-${status}`} aria-label={status.replace('_', ' ')}>
      {ICON[status] ?? '·'}
    </span>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

/** Seconds -> "0:42" */
export const fmtTs = (sec) => (sec == null ? '' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`);
