// Demo data. Uses a made-up brand so the demo video carries no third-party trademarks.
import { db, insert, newId } from './db.js';
import { normalizeChecklist } from './brief.js';

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA'); // local YYYY-MM-DD, so "today" is today where the server runs
};

export const DEMO_BRIEF = `Hi! For the Glow Serum launch we'd love one YouTube video.

- Show the Glow Serum bottle on camera
- Tell your audience in your own words why you like it
- Put @juniperco and our link juniperco.com/glow in the description

Keep it upbeat and please don't mention other skincare brands. Fee is agreed per creator, paid on approval.`;

// What the brief parser returns for DEMO_BRIEF, frozen so seeding needs no API call.
const DEMO_CHECKLIST_RAW = {
  brand: 'Juniper & Co.',
  product: 'Glow Serum',
  summary: 'One YouTube video showing Glow Serum, with @juniperco and juniperco.com/glow in the description.',
  requirements: [
    { kind: 'SHOW_PRODUCT', description: 'Show the Glow Serum bottle on camera', value: '', quote_from_brief: 'Show the Glow Serum bottle on camera' },
    { kind: 'CUSTOM_VIDEO', description: 'Say in your own words why you like it', value: '', quote_from_brief: 'Tell your audience in your own words why you like it' },
    { kind: 'INCLUDE_TEXT', description: 'Tag @juniperco in the description', value: '@juniperco', quote_from_brief: 'Put @juniperco … in the description' },
    { kind: 'INCLUDE_LINK', description: 'Link juniperco.com/glow in the description', value: 'juniperco.com/glow', quote_from_brief: 'our link juniperco.com/glow' },
  ],
  ignored: ['Keep it upbeat', "Don't mention other skincare brands", 'Fee is agreed per creator, paid on approval'],
};

const CREATORS = [
  ['Maya Chen', '@mayaglows', 30000, 0],
  ['Theo Okafor', '@theodoesskin', 25000, 2],
  ['Priya Raman', '@priyaroutine', 40000, 4],
  ['Jordan Lee', '@jordanlee', 20000, 7],
  ['Sofia Alvarez', '@sofiaskinlab', 35000, 10],
];

/** Wipes campaigns/deliverables/payouts/events (keeps the video-analysis cache) and loads demo data. */
export function seedDemo({ receiver }) {
  if (!receiver) throw new Error('Set PAYPAL_TEST_RECEIVER to a sandbox personal account email before seeding');
  db.exec(
    'DELETE FROM events; DELETE FROM payouts; DELETE FROM checks; DELETE FROM invoices; DELETE FROM deliverables; DELETE FROM creators; DELETE FROM campaigns;',
  );

  const campaign = insert('campaigns', {
    id: newId('cmp'),
    name: 'Glow Serum launch',
    brand: 'Juniper & Co.',
    brief_text: DEMO_BRIEF,
    budget_cents: 150000,
    funded_cents: 0, // funded for real by paying the PayPal invoice in the demo
    checklist: normalizeChecklist(DEMO_CHECKLIST_RAW, 'Juniper & Co.'),
  });

  for (const [name, handle, fee, dueIn] of CREATORS) {
    const creator = insert('creators', { id: newId('cr'), name, handle, paypal_email: receiver });
    insert('deliverables', {
      id: newId('dl'),
      campaign_id: campaign.id,
      creator_id: creator.id,
      title: 'Glow Serum video',
      due_date: day(dueIn),
      fee_cents: fee,
    });
  }
  return campaign;
}
