import { forwardRef, useImperativeHandle, useRef } from 'react';
import { CheckIcon, fmtTs } from './ui.jsx';

export function videoIdFrom(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12);
    return u.searchParams.get('v') || u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1] || null;
  } catch {
    return /^[\w-]{11}$/.test(url) ? url : null;
  }
}

/** YouTube embed that can be told to jump to a timestamp. */
export const VideoPlayer = forwardRef(function VideoPlayer({ videoId }, ref) {
  const frame = useRef(null);
  useImperativeHandle(ref, () => ({
    seek(sec) {
      const send = (func, args = []) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
      send('seekTo', [sec, true]);
      send('playVideo');
      frame.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
  }));
  if (!videoId) return null;
  return (
    <div className="video-frame">
      <iframe
        ref={frame}
        src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0&playsinline=1`}
        title="Submitted video"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
});

const VERDICT_COPY = {
  PASS: ['All checks passed', 'Payment is released automatically.'],
  FIX_NEEDED: ['Changes needed', 'Payment is held until the post is fixed.'],
  HUMAN_REVIEW: ['Needs a person to look', 'The checks were not sure about something. No money moves until someone approves.'],
};

export function VerdictBanner({ verdict, checkedAt, analysis }) {
  const [title, sub] = VERDICT_COPY[verdict] ?? [verdict, ''];
  return (
    <div className={`verdict verdict-${verdict}`}>
      <CheckIcon status={verdict === 'PASS' ? 'met' : verdict === 'FIX_NEEDED' ? 'not_met' : 'unsure'} />
      <div>
        <div className="verdict-title">{title}</div>
        <div className="verdict-sub">
          {sub}
          {analysis?.model && ` · Video checked by ${analysis.model}${analysis.cached ? ' (reused)' : analysis.ms ? ` in ${Math.round(analysis.ms / 1000)}s` : ''}`}
          {checkedAt && ` · ${new Date(checkedAt.replace(' ', 'T') + 'Z').toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
        </div>
      </div>
    </div>
  );
}

/** One row per checklist item with evidence and a jump-to-timestamp button. */
export function CheckResults({ items, onSeek, showFix = true }) {
  const order = { not_met: 0, unsure: 1, met: 2 };
  const sorted = [...items].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <div>
      {sorted.map((i) => (
        <div key={i.id} className="check-row">
          <CheckIcon status={i.status} />
          <div style={{ minWidth: 0 }}>
            <div className="check-desc">
              {i.description}
              <span className="source-tag">{i.source === 'video' ? 'in video' : 'YouTube data'}</span>
            </div>
            <div className="check-evidence">{i.evidence}</div>
            {showFix && i.status !== 'met' && i.howToFix && <div className="check-fix">→ {i.howToFix}</div>}
          </div>
          <div>
            {i.timestampSec != null && onSeek && (
              <button type="button" className="ts-btn" onClick={() => onSeek(i.timestampSec)} title="Jump to this moment">
                ▶ {fmtTs(i.timestampSec)}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
