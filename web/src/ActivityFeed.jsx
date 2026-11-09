import { useEffect, useRef, useState } from 'react';
import { api, timeAgo, parseTime } from './api.js';

// Edge colour on the log line: green = money or a pass, ochre = held, brick = error.
const TONE = {
  'check.error': 'brick',
  'fix.requested': 'ochre',
  'review.needed': 'ochre',
  'review.rejected': 'ochre',
  'policy.hold': 'ochre',
  'policy.review': 'ochre',
  'review.approved': 'green',
  'post.verified': 'green',
  'payout.paid': 'pink',
  'funds.received': 'pink',
  'payout.error': 'brick',
  'payout.failed': 'brick',
  'invoice.error': 'brick',
};

const clock = (iso) => parseTime(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

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
      {events.map((e) => (
        <li
          key={e.id}
          className={e.fresh ? 'fresh' : ''}
          data-tone={TONE[e.type]}
          role={e.deliverable_id ? 'button' : undefined}
          onClick={() => e.deliverable_id && onSelect?.(e.deliverable_id)}
          style={{ cursor: e.deliverable_id ? 'pointer' : 'default' }}
        >
          <span className="ev-time">{clock(e.created_at)}</span>
          <div>
            <div className="ev-msg">{e.message}</div>
            <div className="ev-meta">
              {creatorNames[e.deliverable_id] ? `${creatorNames[e.deliverable_id]} · ` : ''}
              {timeAgo(e.created_at)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
