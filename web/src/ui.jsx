import { Link } from 'react-router-dom';

// One place that defines how each status looks and reads.
// tone -> .mark-<tone> in styles.css; color -> the timeline bar.
export const STATUS = {
  due: { label: 'Due', tone: 'grey', color: '#ffffff' },
  submitted: { label: 'Queued', tone: 'blue', color: '#90a8ed' },
  verifying: { label: 'Checking', tone: 'blue', color: '#90a8ed' },
  fix_needed: { label: 'Fix needed', tone: 'red', color: '#ff7051' },
  human_review: { label: 'Needs review', tone: 'yellow', color: '#f0dc9a' },
  verified: { label: 'Passed', tone: 'teal', color: '#23a094' },
  paying: { label: 'Paying', tone: 'teal', color: '#23a094' },
  paid: { label: 'Paid', tone: 'pink', color: '#ff90e8' },
  payout_failed: { label: 'Payout failed', tone: 'red', color: '#dc341e' },
  checking: { label: 'Checking', tone: 'blue' }, // legend swatch without the spinner
};

export function StatusPill({ status }) {
  const s = STATUS[status] ?? { label: status, tone: 'grey' };
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
      <svg className="logo-mark" viewBox="0 0 30 30" aria-hidden>
        <path d="M5 2.5h20a2 2 0 0 1 2 2V27l-3.5-2-3.5 2-3.5-2-3.5 2-3.5-2L3 27V4.5a2 2 0 0 1 2-2z" fill="#ff90e8" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 13.5l4 4 8-8" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      cleared
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
