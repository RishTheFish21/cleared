import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, money, usePolling, fmtDay, parseTime } from './api.js';
import { Logo } from './ui.jsx';
import { VideoPlayer, CheckResults, videoIdFrom } from './VideoEvidence.jsx';

const KIND_HINT = {
  MENTION_BRAND: 'Say or show the brand name',
  DISCLOSE_IN_VIDEO: 'Say it’s sponsored (or show “Ad” on screen) before you start talking about the product',
  DISCLOSE_IN_DESCRIPTION: 'Put #ad or “Sponsored by …” in the first line of the description',
  PAID_PROMOTION_FLAG: 'Tick “Includes paid promotion” in YouTube Studio',
};

export default function CreatorPage() {
  const { id } = useParams();
  const { data: d, error, refresh } = usePolling(`/deliverables/${id}`, 1500);
  const player = useRef(null);

  if (error && !d) return <Shell><div className="card hero">This link doesn’t look right. Ask the brand to send it again.</div></Shell>;
  if (!d) return <Shell />;

  const result = d.latest_check?.result;
  const funded = d.campaign_funded_cents >= d.fee_cents;
  const s = d.status;
  const stepState = {
    funded: funded ? 'done' : '',
    posted: d.post_url ? 'done' : 'current',
    checked: d.verified_at ? 'done' : ['submitted', 'verifying'].includes(s) ? 'current' : ['fix_needed', 'human_review'].includes(s) ? 'warn' : '',
    paid: s === 'paid' ? 'done' : ['verified', 'paying'].includes(s) ? 'current' : '',
  };

  return (
    <Shell>
      <div className="card hero">
        <div className="brand">{d.brand} · {d.campaign_name}</div>
        <div className="fee">{money(d.fee_cents)}</div>
        <div>
          {d.title} · due {fmtDay(d.due_date, 'long')}
        </div>
        <div className="steps">
          {[
            ['funded', funded ? 'Brand paid' : 'Awaiting brand'],
            ['posted', 'Posted'],
            ['checked', 'Checked'],
            ['paid', 'Paid'],
          ].map(([k, label]) => (
            <div key={k} className={`step ${stepState[k]}`}>
              <div className="bar" />
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {s === 'paid' && <Paid d={d} />}
        {['verified', 'paying'].includes(s) && (
          <div className="card hero" style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ width: 22, height: 22, color: 'var(--green)', margin: '0 auto 10px' }} />
            <h2>Your video passed. Sending your money now…</h2>
            <p className="muted small">PayPal usually confirms in under 30 seconds.</p>
          </div>
        )}
        {['submitted', 'verifying'].includes(s) && (
          <div className="card hero" style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ width: 22, height: 22, color: 'var(--violet)', margin: '0 auto 10px' }} />
            <h2>Checking your video…</h2>
            <p className="muted small">We’re watching it against the brief. This takes about 10–20 seconds.</p>
          </div>
        )}
        {s === 'human_review' && (
          <div className="card hero">
            <h2>Almost there</h2>
            <p className="muted">Someone on the {d.brand} team is taking a quick look. You don’t need to do anything.</p>
          </div>
        )}
        {s === 'fix_needed' && <FixNeeded d={d} result={result} onDone={refresh} onSeek={(t) => player.current?.seek(t)} />}
        {s === 'payout_failed' && (
          <div className="card hero">
            <h2>Your video passed, but the payment didn’t go through</h2>
            <p className="muted">The {d.brand} team has been told and will sort it out.</p>
          </div>
        )}
        {s === 'due' && <Submit d={d} onDone={refresh} />}

        {d.post_url && s !== 'due' && (
          <div className="card hero">
            <h3 style={{ marginBottom: 10 }}>Your video</h3>
            <VideoPlayer ref={player} videoId={result?.video?.id ?? videoIdFrom(d.post_url)} />
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="creator-shell">
      <div className="creator-top">
        <Logo to="#" />
        <span className="sandbox-tag">Sandbox</span>
      </div>
      <main className="creator-main">{children}</main>
    </div>
  );
}

function Submit({ d, onDone, label = 'Submit for payment' }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api(`/deliverables/${d.id}/submit`, { method: 'POST', body: { post_url: url.trim() } });
      await onDone();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  const reqs = d.checklist?.requirements ?? [];
  return (
    <form className="card hero" onSubmit={submit}>
      <h2>Posted it? Get paid.</h2>
      <p className="muted small" style={{ marginTop: 4 }}>
        Paste your public YouTube link. Once it passes the checks below, {money(d.fee_cents)} goes straight to your PayPal.
      </p>
      <div className="field" style={{ marginTop: 12 }}>
        <input className="input" required placeholder="https://youtube.com/watch?v=…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      {err && <p className="error-text">{err}</p>}
      <button className="btn btn-green" disabled={busy} style={{ width: '100%', height: 42 }}>
        {busy ? 'Submitting…' : label}
      </button>
      {reqs.length > 0 && (
        <>
          <div className="section-title">What we check</div>
          <ul className="req-list">
            {reqs.map((r) => (
              <li key={r.id} className="req small">
                {KIND_HINT[r.kind] ?? r.description}
              </li>
            ))}
          </ul>
        </>
      )}
    </form>
  );
}

function FixNeeded({ d, result, onDone, onSeek }) {
  const [busy, setBusy] = useState(false);
  const recheck = async () => {
    setBusy(true);
    try {
      await api(`/deliverables/${d.id}/recheck`, { method: 'POST' });
      await onDone();
    } finally {
      setBusy(false);
    }
  };
  const needsReupload = result?.needsReupload;
  return (
    <>
      <div className="card hero">
        <h2>A quick fix and you’re paid</h2>
        {d.fix_message && <div className="message-box" style={{ marginTop: 10 }}>{d.fix_message}</div>}
        {result && (
          <div style={{ marginTop: 8 }}>
            <CheckResults items={result.items.filter((i) => i.status !== 'met')} onSeek={onSeek} />
          </div>
        )}
        {!needsReupload && (
          <>
            <button className="btn btn-green" style={{ width: '100%', height: 42, marginTop: 12 }} disabled={busy} onClick={recheck}>
              {busy ? 'Starting check…' : 'I fixed it, check again'}
            </button>
            <p className="muted small" style={{ textAlign: 'center', marginTop: 6 }}>
              We also re-check automatically every few minutes.
            </p>
          </>
        )}
      </div>
      {needsReupload && <Submit d={d} onDone={onDone} label="Submit the new video" />}
    </>
  );
}

function Paid({ d }) {
  const secs = d.verified_at && d.paid_at ? Math.round((parseTime(d.paid_at) - parseTime(d.verified_at)) / 1000) : null;
  return (
    <div className="card paid-banner">
      <div className="paid-check">✓</div>
      <h2 style={{ fontSize: 20 }}>You’ve been paid {money(d.payout?.amount_cents ?? d.fee_cents)}</h2>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        Sent to your PayPal{secs != null ? `, ${secs} seconds after your video passed` : ''}.
      </p>
      {d.payout?.batch_id && (
        <p className="muted small mono" style={{ marginTop: 10 }}>
          PayPal batch {d.payout.batch_id}
        </p>
      )}
    </div>
  );
}
