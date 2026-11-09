// Turns a brand's free-text brief into a checklist the verifier can test.
// The AI extracts requirements; code then guarantees the FTC items are present.
import { generateJson } from './gemini.js';
import { config } from './config.js';

// Each kind maps to one check in verifier.js.
// "video" kinds are judged by Gemini watching the video and can only be fixed by re-uploading.
// "metadata" kinds are read from the YouTube API and the creator can fix them in place.
export const REQUIREMENT_KINDS = {
  MENTION_BRAND: { source: 'video', label: 'Says the brand name' },
  SHOW_PRODUCT: { source: 'video', label: 'Shows the product' },
  DISCLOSE_IN_VIDEO: { source: 'video', label: 'Discloses the sponsorship in the video' },
  CUSTOM_VIDEO: { source: 'video', label: 'Other on-camera requirement' },
  DISCLOSE_IN_DESCRIPTION: { source: 'metadata', label: 'Discloses in the description' },
  PAID_PROMOTION_FLAG: { source: 'metadata', label: 'YouTube "paid promotion" box ticked' },
  INCLUDE_TEXT: { source: 'metadata', label: 'Description includes text' },
  INCLUDE_LINK: { source: 'metadata', label: 'Description includes link' },
  MIN_DURATION_SECONDS: { source: 'metadata', label: 'Minimum length' },
};

const schema = {
  type: 'OBJECT',
  properties: {
    brand: { type: 'STRING', description: 'Brand name exactly as it should be said' },
    product: { type: 'STRING', description: 'Product name, empty if none' },
    summary: { type: 'STRING', description: 'One-sentence plain summary of the deliverable' },
    requirements: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: Object.keys(REQUIREMENT_KINDS) },
          description: { type: 'STRING', description: 'Short, specific, checkable wording' },
          value: {
            type: 'STRING',
            description:
              'INCLUDE_TEXT: the exact text (e.g. "@juniperco" or "GLOW15"). INCLUDE_LINK: the URL or domain. MIN_DURATION_SECONDS: a number. SHOW_PRODUCT: max seconds from start, or empty. Otherwise empty.',
          },
          quote_from_brief: { type: 'STRING', description: 'The words in the brief this came from' },
        },
        required: ['kind', 'description', 'value', 'quote_from_brief'],
      },
    },
    ignored: {
      type: 'ARRAY',
      description: 'Brief items that cannot be checked automatically (e.g. tone, payment terms)',
      items: { type: 'STRING' },
    },
  },
  required: ['brand', 'product', 'summary', 'requirements', 'ignored'],
};

const SYSTEM = `You turn influencer-marketing briefs into a checklist for an automated verifier of YouTube videos.
Rules:
- Only include requirements actually stated in the brief, mapped to the closest kind.
- Use CUSTOM_VIDEO only for on-camera requirements that fit no other kind.
- Never invent requirements. Put anything about money, tone, dates or that cannot be verified from the video or its description into "ignored".
- Keep descriptions short and concrete, e.g. "Show Glow Serum within the first 10 seconds".`;

/** Returns { brand, product, summary, requirements: [{id, kind, source, description, value, ...}], ignored } */
export async function parseBrief({ brand, briefText }) {
  const { data } = await generateJson({
    model: config.gemini.textModel,
    system: SYSTEM,
    schema,
    parts: [{ text: `Brand: ${brand}\n\nBrief:\n${briefText}` }],
  });
  return normalizeChecklist(data, brand);
}

/** Deterministic clean-up: dedupe, add mandatory FTC items, number the requirements. */
export function normalizeChecklist(raw, fallbackBrand) {
  const brand = raw.brand?.trim() || fallbackBrand;
  const reqs = (raw.requirements ?? []).filter((r) => REQUIREMENT_KINDS[r.kind]);

  const has = (kind) => reqs.some((r) => r.kind === kind);
  const add = (kind, description) =>
    reqs.push({ kind, description, value: '', quote_from_brief: '', added_by: 'policy' });

  // FTC: the sponsorship must be disclosed in the video itself, and should be clear in text too.
  if (!has('MENTION_BRAND')) add('MENTION_BRAND', `Says "${brand}" in the video`);
  if (!has('DISCLOSE_IN_VIDEO')) add('DISCLOSE_IN_VIDEO', 'Says or shows that the video is sponsored, before or when first endorsing the brand');
  if (!has('DISCLOSE_IN_DESCRIPTION')) add('DISCLOSE_IN_DESCRIPTION', 'Description clearly says it is sponsored (e.g. #ad, "Sponsored by")');
  if (!has('PAID_PROMOTION_FLAG')) add('PAID_PROMOTION_FLAG', 'Tick YouTube\'s "includes paid promotion" box');

  const seen = new Set();
  const requirements = reqs
    .filter((r) => {
      const key = `${r.kind}|${(r.value || '').toLowerCase()}|${r.kind === 'CUSTOM_VIDEO' ? r.description : ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r, i) => ({
      id: `r${i + 1}`,
      kind: r.kind,
      source: REQUIREMENT_KINDS[r.kind].source,
      description: r.description,
      value: r.value ?? '',
      quote_from_brief: r.quote_from_brief ?? '',
      added_by: r.added_by ?? 'ai',
    }));

  return { brand, product: raw.product ?? '', summary: raw.summary ?? '', requirements, ignored: raw.ignored ?? [] };
}
