import { Link } from 'react-router-dom';

// One place that defines how each status looks and reads.
// tone -> .mark-<tone> in styles.css; color -> the timeline bar.
export const STATUS = {
  due: { label: 'Due', tone: 'due', color: '#a29e93' },
  submitted: { label: 'Queued', tone: 'busy', color: '#44423c' },
  verifying: { label: 'Checking', tone: 'busy', color: '#44423c' },
  fix_needed: { label: 'Fix needed', tone: 'held', color: '#9a5800' },
  human_review: { label: 'Review', tone: 'held', color: '#c08a2c' },
  verified: { label: 'Cleared', tone: 'cleared', color: '#3c8a60' },
  paying: { label: 'Paying', tone: 'cleared', color: '#3c8a60' },
  paid: { label: 'Paid', tone: 'paid', color: '#1d6b44' },
  payout_failed: { label: 'Failed', tone: 'failed', color: '#a8321f' },
  checking: { label: 'Checking', tone: 'busy' }, // legend swatch without the spinner
};

export function StatusPill({ status }) {
  const s = STATUS[status] ?? { label: status, tone: 'due' };
  const busy = status === 'verifying' || status === 'paying' || status === 'submitted';
  return (
    <span className={`mark mark-${s.tone}`}>
      {busy && <span className="spinner" aria-hidden />}
      {s.label}
    </span>
  );
}

export function Logo({ to = '/' }) {
  return (
    <Link to={to} className="logo" aria-label="Cleared home">
      <span className="stamp">Cleared</span>
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
