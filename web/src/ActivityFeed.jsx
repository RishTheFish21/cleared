import { useEffect, useRef, useState } from 'react';
import { api, timeAgo } from './api.js';

const LOOK = {
  'post.submitted': ['↑', 'var(--blue-bg)', 'var(--blue)'],
  'check.started': ['◎', 'var(--violet-bg)', 'var(--violet)'],
  'check.requested': ['↻', 'var(--violet-bg)', 'var(--violet)'],
  'check.finished': ['◉', 'var(--violet-bg)', 'var(--violet)'],
  'check.error': ['!', 'var(--red-bg)', 'var(--red)'],
  'fix.requested': ['✎', 'var(--amber-bg)', 'var(--amber)'],
  'review.needed': ['?', 'var(--amber-bg)', 'var(--amber)'],
  'review.approved': ['✓', 'var(--green-bg)', 'var(--green)'],
  'review.rejected': ['✕', 'var(--amber-bg)', 'var(--amber)'],
  'post.verified': ['✓', 'var(--green-bg)', 'var(--green)'],
  'policy.pay': ['§', 'var(--green-bg)', 'var(--green)'],
  'policy.hold': ['§', 'var(--amber-bg)', 'var(--amber)'],
  'policy.review': ['§', 'var(--amber-bg)', 'var(--amber)'],
  'payout.sending': ['$', 'var(--green-bg)', 'var(--green)'],
  'payout.created': ['$', 'var(--green-bg)', 'var(--green)'],
  'payout.paid': ['$', 'var(--green)', '#fff'],
  'payout.error': ['!', 'var(--red-bg)', 'var(--red)'],
  'payout.failed': ['!', 'var(--red-bg)', 'var(--red)'],
  'funds.received': ['+', 'var(--green)', '#fff'],
  'invoice.sent': ['✉', 'var(--blue-bg)', 'var(--blue)'],
  'invoice.error': ['!', 'var(--red-bg)', 'var(--red)'],
};

/** Live log of everything the agent did, newest first. */
export default function ActivityFeed({ campaignId, creatorNames = {}, onSelect }) {
  const [events, setEvents] = useState([]);
  const lastId = useRef(0);
  const firstLoad = useRef(true);
  const [, tick] = useState(0);

  useEffect(() => {
    let alive = true;
    lastId.current = 0;
    firstLoad.current = true;
    setEvents([]);
    const load = async () => {
      try {
        const fresh = await api(`/events?campaign_id=${campaignId}&since=${lastId.current}`);
        if (!alive || !fresh.length) return;
        lastId.current = fresh[fresh.length - 1].id;
        const marked = fresh.map((e) => ({ ...e, fresh: !firstLoad.current }));
        setEvents((prev) => [...marked.reverse(), ...prev].slice(0, 150));
      } catch {
        /* keep last good list */
      } finally {
        firstLoad.current = false;
      }
    };
    load();
    const t = setInterval(load, 1500);
    const clock = setInterval(() => tick((n) => n + 1), 15000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(clock);
    };
  }, [campaignId]);

  if (!events.length) return <p className="muted small" style={{ padding: '12px 16px' }}>Nothing yet. Activity shows up here as it happens.</p>;

  return (
    <ul className="feed">
      {events.map((e) => {
        const [icon, bg, fg] = LOOK[e.type] ?? ['·', 'var(--gray-bg)', 'var(--muted)'];
        return (
          <li key={e.id} className={e.fresh ? 'fresh' : ''} onClick={() => e.deliverable_id && onSelect?.(e.deliverable_id)} style={{ cursor: e.deliverable_id ? 'pointer' : 'default' }}>
            <span className="ev-dot" style={{ background: bg, color: fg }}>
              {icon}
            </span>
            <div>
              <div className="ev-msg">{e.message}</div>
              <div className="ev-meta">
                {creatorNames[e.deliverable_id] ? `${creatorNames[e.deliverable_id]} · ` : ''}
                {timeAgo(e.created_at)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
