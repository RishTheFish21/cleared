import { useState } from 'react';

const KIND_LABEL = {
  MENTION_BRAND: 'Brand mention',
  SHOW_PRODUCT: 'Product on screen',
  DISCLOSE_IN_VIDEO: 'In-video disclosure',
  CUSTOM_VIDEO: 'On camera',
  DISCLOSE_IN_DESCRIPTION: 'Text disclosure',
  PAID_PROMOTION_FLAG: 'YouTube setting',
  INCLUDE_TEXT: 'Description',
  INCLUDE_LINK: 'Link',
  MIN_DURATION_SECONDS: 'Length',
};

/** What the AI pulled out of the brief, plus the FTC items code always adds. */
export default function ChecklistCard({ checklist, brief }) {
  const [showBrief, setShowBrief] = useState(false);
  if (!checklist) return null;
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Checklist from the brief</h2>
          <div className="muted small">Every post is checked against these before money moves.</div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowBrief((s) => !s)}>
          {showBrief ? 'Hide brief' : 'Show brief'}
        </button>
      </div>
      <div className="card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {showBrief && <div className="message-box" style={{ margin: '10px 0' }}>{brief}</div>}
        <ul className="req-list">
          {checklist.requirements.map((r) => (
            <li key={r.id} className="req">
              <div style={{ flex: 1 }}>
                <div>{r.description}</div>
                <div className="req-kind">
                  {KIND_LABEL[r.kind] ?? r.kind} · {r.source === 'video' ? 'checked by watching the video' : 'checked from YouTube data'}
                  {r.quote_from_brief ? ` · “${r.quote_from_brief}”` : ''}
                </div>
              </div>
              <div>{r.added_by === 'policy' ? <span className="tag tag-ftc">FTC</span> : <span className="tag tag-ai">From brief</span>}</div>
            </li>
          ))}
        </ul>
        {checklist.ignored?.length > 0 && (
          <p className="muted small" style={{ margin: '8px 0 10px' }}>
            Not checked automatically: {checklist.ignored.join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
