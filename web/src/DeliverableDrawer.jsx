import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, usePolling, timeAgo, fmtDay, parseTime, payoutTiming } from './api.js';
import { StatusPill } from './ui.jsx';
import { VideoPlayer, VerdictBanner, CheckResults, videoIdFrom } from './VideoEvidence.jsx';

export default function DeliverableDrawer({ id, onClose }) {
  const { data: d, refresh } = usePolling(`/deliverables/${id}`, 1500);
  const player = useRef(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (name, path, body) => {
    setBusy(name);
    setErr(null);
    try {
      await api(path, { method: 'POST', body });
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const check = d?.latest_check;
  const result = check?.result;
  const videoId = result?.video?.id ?? videoIdFrom(d?.post_url);
  const checkIsCurrent = check && d && ['fix_needed', 'human_review', 'verified', 'paying', 'paid', 'payout_failed'].includes(d.status);
  const creatorUrl = `${window.location.origin}/c/${id}`;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" aria-label="Deliverable details">
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2>{d?.title ?? 'Loading…'}</h2>
              {d && <StatusPill status={d.status} />}
            </div>
            {d && (
              <div className="muted small" style={{ marginTop: 3 }}>
                {d.creator_name}
                {d.creator_handle ? ` (${d.creator_handle})` : ''} · {money(d.fee_cents)} · due{' '}
                {fmtDay(d.due_date)}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {d && (
          <div className="drawer-body">
            {d.status === 'paid' && d.payout && <PaidBox d={d} />}

            {videoId && <VideoPlayer ref={player} videoId={videoId} />}

            {d.status === 'due' && (
              <div className="message-box">
                Waiting for {d.creator_name} to post. Share their link:{' '}
                <Link to={`/c/${id}`} className="mono" target="_blank">
                  {creatorUrl}
                </Link>
              </div>
            )}

            {['submitted', 'verifying'].includes(d.status) && (
              <div className="verdict verdict-busy">
                <span className="spinner" style={{ width: 14, height: 14 }} />
                <div>
                  <div className="verdict-title">Checking the video against the brief</div>
                  <div className="verdict-sub">Gemini is watching the video while code checks the YouTube data.</div>
                </div>
              </div>
            )}

            {checkIsCurrent && result && (
              <>
                <VerdictBanner verdict={result.verdict} checkedAt={check.finished_at} analysis={result.analysis} />
                <CheckResults items={result.items} onSeek={(s) => player.current?.seek(s)} />
              </>
            )}

            {d.status === 'human_review' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn btn-green" disabled={!!busy} onClick={() => act('approve', `/deliverables/${id}/approve`, { note: 'Reviewed evidence' })}>
                  {busy === 'approve' ? 'Approving…' : 'Approve and pay'}
                </button>
                <button
                  className="btn"
                  disabled={!!busy}
                  onClick={() => {
                    const message = window.prompt('What should the creator change?');
                    if (message) act('reject', `/deliverables/${id}/reject`, { message });
                  }}
                >
                  Ask for changes
                </button>
              </div>
            )}

            {d.fix_message && d.status === 'fix_needed' && (
              <>
                <div className="section-title">Message sent to creator</div>
                <div className="message-box">{d.fix_message}</div>
                <p className="muted small">
                  {d.next_check_at
                    ? `Re-checking automatically ${timeUntil(d.next_check_at)}, or when they tap "I fixed it".`
                    : 'Waiting for the creator to re-upload and send a new link.'}
                </p>
              </>
            )}

            {err && <p className="error-text">{err}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {d.post_url && !['paid', 'paying', 'verifying', 'submitted'].includes(d.status) && (
                <button className="btn btn-sm" disabled={!!busy} onClick={() => act('recheck', `/deliverables/${id}/recheck`)}>
                  {busy === 'recheck' ? 'Starting…' : 'Re-check now'}
                </button>
              )}
              <Link className="btn btn-sm" to={`/c/${id}`} target="_blank">
                Open creator view ↗
              </Link>
              {d.post_url && (
                <a className="btn btn-sm btn-ghost" href={d.post_url} target="_blank" rel="noreferrer">
                  Open on YouTube ↗
                </a>
              )}
            </div>

            <div className="section-title">History</div>
            <ul className="feed" style={{ maxHeight: 'none', padding: 0 }}>
              {[...d.events].reverse().map((e) => (
                <li key={e.id} style={{ padding: '6px 0', gridTemplateColumns: '1fr' }}>
                  <div>
                    <div className="ev-msg">{e.message}</div>
                    <div className="ev-meta">{timeAgo(e.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </>
  );
}

function PaidBox({ d }) {
  const timing = payoutTiming(d);
  return (
    <div className="panel">
      <div className="panel-title">Paid {money(d.payout.amount_cents)}</div>
      <div className="panel-body" style={{ fontSize: 19 }}>
        Sent with PayPal Payouts{timing ? `, ${timing.secs} seconds after ${timing.afterFunds ? "the brand's payment came in" : 'the post passed'}` : ''}
      </div>
      <dl className="kv" style={{ gridTemplateColumns: 'auto 1fr' }}>
        <dt>Batch</dt>
        <dd className="mono">{d.payout.batch_id}</dd>
        <dt>To</dt>
        <dd>{d.payout.receiver}</dd>
      </dl>
    </div>
  );
}

function timeUntil(iso) {
  const s = Math.round((parseTime(iso) - Date.now()) / 1000);
  if (s <= 5) return 'any second';
  if (s < 90) return `in ${s}s`;
  return `in ${Math.round(s / 60)} min`;
}
