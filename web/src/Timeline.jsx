import { useMemo } from 'react';
import { BryntumScheduler } from '@bryntum/scheduler-react';
import { StringHelper } from '@bryntum/scheduler';
import '@bryntum/scheduler/scheduler.css';
import '@bryntum/scheduler/svalbard-light.css';
import '@bryntum/scheduler/fontawesome/css/fontawesome.css';
import '@bryntum/scheduler/fontawesome/css/solid.css';
import { STATUS } from './ui.jsx';
import { money, parseDay } from './api.js';

const DAY = 86400000;
const startOfDay = (d) => new Date(new Date(d).setHours(0, 0, 0, 0));

/**
 * Creators as rows, each deliverable as a bar ending on its due date,
 * coloured by where it is in verify → pay.
 */
export default function Timeline({ deliverables, onSelect }) {
  // Only hand Bryntum new data when something visible changed, so polling doesn't redraw it.
  const key = deliverables.map((d) => `${d.id}:${d.status}:${d.due_date}:${d.paid_at}`).join('|');

  const { resources, events, startDate, endDate } = useMemo(() => {
    const byCreator = new Map();
    for (const d of deliverables) byCreator.set(d.creator_id, { id: d.creator_id, name: d.creator_name, handle: d.creator_handle });

    const events = deliverables.map((d) => {
      const due = startOfDay(parseDay(d.due_date));
      return {
        id: d.id,
        resourceId: d.creator_id,
        name: d.title,
        startDate: new Date(due.getTime() - 2 * DAY), // posting window
        endDate: new Date(due.getTime() + DAY),
        eventColor: STATUS[d.status]?.bryntum ?? 'gray',
        status: d.status,
        fee: d.fee_cents,
      };
    });

    const today = startOfDay(Date.now());
    const dates = events.flatMap((e) => [e.startDate, e.endDate]).concat(today);
    const min = new Date(Math.min(...dates) - 3 * DAY);
    const max = new Date(Math.max(...dates.map(Number), today.getTime() + 14 * DAY) + 3 * DAY);
    return { resources: [...byCreator.values()], events, startDate: min, endDate: max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="timeline-wrap">
      <BryntumScheduler
        resources={resources}
        events={events}
        startDate={startDate}
        endDate={endDate}
        viewPreset="weekAndDayLetter"
        tickSize={34}
        rowHeight={58}
        barMargin={9}
        eventStyle="tonal"
        readOnly
        zoomOnMouseWheel={false}
        eventEditFeature={false}
        eventDragCreateFeature={false}
        timeRangesFeature={{ showCurrentTimeLine: true }}
        eventTooltipFeature={{
          template: ({ eventRecord: e }) =>
            `<b>${StringHelper.encodeHtml(e.name)}</b><br>${StringHelper.encodeHtml(STATUS[e.status]?.label ?? e.status)} · ${money(e.fee)}<br>Due ${e.endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        }}
        columns={[
          {
            text: 'Creator',
            field: 'name',
            width: 190,
            htmlEncode: false,
            renderer: ({ record }) =>
              `<div style="line-height:1.25"><div style="font-weight:600">${StringHelper.encodeHtml(record.name)}</div>${
                record.handle ? `<div style="font-size:12px;color:#6b7280">${StringHelper.encodeHtml(record.handle)}</div>` : ''
              }</div>`,
          },
        ]}
        // Every row is the same deliverable type, so the bar shows what differs: status and fee.
        eventRenderer={({ eventRecord: e }) =>
          `<div class="ev-inner"><span>${StringHelper.encodeHtml(STATUS[e.status]?.label ?? e.status)}</span><span class="ev-sub">${money(
            e.fee,
          )}</span></div>`
        }
        onEventClick={({ eventRecord }) => onSelect(eventRecord.id)}
      />
    </div>
  );
}
