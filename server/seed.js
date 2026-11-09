// Demo data. Uses a made-up brand so the demo video carries no third-party trademarks.
import { db, insert, newId } from './db.js';
import { normalizeChecklist } from './brief.js';

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA'); // local YYYY-MM-DD, so "today" is today where the server runs
};

export const DEMO_BRIEF = `Hi! For the Charge launch we'd love one YouTube video.

- Show the Charge can on camera
- Tell your audience in your own words why you like it
- Put @northpaw and our link northpaw.co/charge in the description

Keep it upbeat and please don't mention other energy drink brands. Fee is agreed per creator, paid on approval.`;

// What the brief parser returns for DEMO_BRIEF, frozen so seeding needs no API call.
const DEMO_CHECKLIST_RAW = {
  brand: 'Northpaw',
  product: 'Charge',
  summary: 'One YouTube video showing Charge energy drink, with @northpaw and northpaw.co/charge in the description.',
  requirements: [
    { kind: 'SHOW_PRODUCT', description: 'Show the Charge can on camera', value: '', quote_from_brief: 'Show the Charge can on camera' },
    { kind: 'CUSTOM_VIDEO', description: 'Say in your own words why you like it', value: '', quote_from_brief: 'Tell your audience in your own words why you like it' },
    { kind: 'INCLUDE_TEXT', description: 'Tag @northpaw in the description', value: '@northpaw', quote_from_brief: 'Put @northpaw ... in the description' },
    { kind: 'INCLUDE_LINK', description: 'Link northpaw.co/charge in the description', value: 'northpaw.co/charge', quote_from_brief: 'our link northpaw.co/charge' },
  ],
  ignored: ['Keep it upbeat', "Don't mention other energy drink brands", 'Fee is agreed per creator, paid on approval'],
};

const CREATORS = [
  ['Maya Chen', '@mayalifts', 30000, 0],
  ['Theo Okafor', '@theoplays', 25000, 2],
  ['Priya Raman', '@priyaruns', 40000, 4],
  ['Jordan Lee', '@jordanstreams', 20000, 7],
  ['Sofia Alvarez', '@sofiaonthemove', 35000, 10],
];

/** Wipes campaigns/deliverables/payouts/events (keeps the video-analysis cache) and loads demo data. */
export function seedDemo({ receiver }) {
  if (!receiver) throw new Error('Set PAYPAL_TEST_RECEIVER to a sandbox personal account email before seeding');
  db.exec(
    'DELETE FROM events; DELETE FROM payouts; DELETE FROM checks; DELETE FROM invoices; DELETE FROM deliverables; DELETE FROM creators; DELETE FROM campaigns;',
  );

  const campaign = insert('campaigns', {
    id: newId('cmp'),
    name: 'Charge launch',
    brand: 'Northpaw',
    brief_text: DEMO_BRIEF,
    budget_cents: 150000,
    funded_cents: 0, // funded for real by paying the PayPal invoice in the demo
    checklist: normalizeChecklist(DEMO_CHECKLIST_RAW, 'Northpaw'),
  });

  for (const [name, handle, fee, dueIn] of CREATORS) {
    const creator = insert('creators', { id: newId('cr'), name, handle, paypal_email: receiver });
    insert('deliverables', {
      id: newId('dl'),
      campaign_id: campaign.id,
      creator_id: creator.id,
      title: 'Charge video',
      due_date: day(dueIn),
      fee_cents: fee,
    });
  }
  return campaign;
}
