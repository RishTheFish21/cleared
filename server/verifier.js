// Checks a posted YouTube video against a campaign checklist.
// Metadata items are checked in code from the YouTube API.
// Video items are judged by Gemini watching the video, then sanity-checked in code.
import { createHash } from 'node:crypto';
import { fetchVideo, youtubeId } from './youtube.js';
import { generateJson, youtubePart } from './gemini.js';
import { config } from './config.js';
import { one, run } from './db.js';

const DISCLOSURE_RE = /#ad\b|#sponsored\b|\bsponsored by\b|\bpaid (partnership|promotion)\b|\bin partnership with\b|\bthis (video|post) is sponsored\b|\bad:\s/i;
// Roughly what YouTube shows before "...more". FTC: disclosures shouldn't need a click to see.
const ABOVE_THE_FOLD_CHARS = 150;

const norm = (s) => s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

export function toSeconds(ts) {
  if (!ts) return null;
  const parts = String(ts).trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// ---------- metadata checks (pure code) ----------

function checkMetadata(req, video) {
  const desc = video.description;
  const text = `${video.title}\n${desc}`;
  switch (req.kind) {
    case 'PAID_PROMOTION_FLAG':
      if (video.paidPromotion === null) return { status: 'unsure', evidence: 'YouTube did not return the paid-promotion setting' };
      return video.paidPromotion
        ? { status: 'met', evidence: 'YouTube shows "Includes paid promotion"' }
        : { status: 'not_met', evidence: 'The "includes paid promotion" box is not ticked', howToFix: 'YouTube Studio → this video → Details → Show more → Paid promotion → tick the box → Save.' };

    case 'DISCLOSE_IN_DESCRIPTION': {
      const inTitle = DISCLOSURE_RE.exec(video.title);
      const m = DISCLOSURE_RE.exec(desc);
      if (inTitle) return { status: 'met', evidence: `Title says "${inTitle[0]}"` };
      if (m && m.index <= ABOVE_THE_FOLD_CHARS) return { status: 'met', evidence: `Description starts with "${desc.slice(0, m.index + m[0].length).trim()}"` };
      if (m)
        return {
          status: 'not_met',
          evidence: `"${m[0]}" is ${m.index} characters in, hidden behind "...more"`,
          howToFix: 'Move the disclosure (e.g. "#ad" or "Sponsored by …") to the first line of the description.',
        };
      return { status: 'not_met', evidence: 'No #ad / "Sponsored by" in the title or description', howToFix: 'Add "#ad" or "Sponsored by …" to the first line of the description.' };
    }

    case 'INCLUDE_TEXT': {
      const found = text.toLowerCase().includes(req.value.toLowerCase());
      return found
        ? { status: 'met', evidence: `Found "${req.value}"` }
        : { status: 'not_met', evidence: `"${req.value}" not found in the title or description`, howToFix: `Add "${req.value}" to the description.` };
    }

    case 'INCLUDE_LINK': {
      const found = norm(text).includes(norm(req.value));
      return found
        ? { status: 'met', evidence: `Link to ${req.value} found` }
        : { status: 'not_met', evidence: `No link to ${req.value} in the description`, howToFix: `Add ${req.value} to the description.` };
    }

    case 'MIN_DURATION_SECONDS': {
      const min = Number(req.value) || 0;
      return video.durationSec >= min
        ? { status: 'met', evidence: `Video is ${video.durationSec}s (needs ${min}s)` }
        : { status: 'not_met', evidence: `Video is ${video.durationSec}s, brief asks for at least ${min}s`, howToFix: 'Needs a longer re-upload.' };
    }
    default:
      return { status: 'unsure', evidence: `No metadata check for ${req.kind}` };
  }
}

// ---------- video checks (Gemini) ----------

const evidenceSchema = {
  type: 'OBJECT',
  properties: {
    present: { type: 'BOOLEAN' },
    timestamp: { type: 'STRING', description: 'MM:SS, empty if absent' },
    quote: { type: 'STRING', description: 'Exact words spoken or text shown' },
  },
  required: ['present', 'timestamp', 'quote'],
};

const videoSchema = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          status: { type: 'STRING', enum: ['MET', 'NOT_MET', 'UNSURE'] },
          timestamp: { type: 'STRING', description: 'MM:SS of the supporting moment, empty if none' },
          evidence: { type: 'STRING', description: 'What you saw or heard, quoting exact words where possible' },
        },
        required: ['id', 'status', 'timestamp', 'evidence'],
      },
    },
    disclosure: {
      type: 'OBJECT',
      properties: {
        spoken: evidenceSchema,
        on_screen: evidenceSchema,
        first_endorsement_timestamp: { type: 'STRING', description: 'MM:SS when the creator first promotes the brand' },
        names_the_sponsor: { type: 'BOOLEAN', description: 'Does the disclosure say WHO sponsored it?' },
      },
      required: ['spoken', 'on_screen', 'first_endorsement_timestamp', 'names_the_sponsor'],
    },
  },
  required: ['results', 'disclosure'],
};

function videoPrompt(checklist, items) {
  return `You are auditing a sponsored YouTube video for the brand "${checklist.brand}"${checklist.product ? ` (product: ${checklist.product})` : ''}.
Watch the whole video including audio. Report only what you actually see or hear. If you can't tell, answer UNSURE.

For each requirement below return MET, NOT_MET or UNSURE with the MM:SS timestamp and evidence (quote exact words where possible):
${items.map((r) => `- ${r.id} [${r.kind}]: ${r.description}`).join('\n')}

Meaning of kinds:
- MENTION_BRAND: the brand name is said aloud or clearly shown.
- SHOW_PRODUCT: the product is visibly shown${items.some((r) => r.kind === 'SHOW_PRODUCT' && r.value) ? ' (give the FIRST time it appears)' : ''}.
- DISCLOSE_IN_VIDEO: the creator SAYS or SHOWS AS TEXT IN THE VIDEO that it is sponsored / paid / an ad / a paid partnership. YouTube's own "Includes paid promotion" overlay does NOT count. "Gifted" or "sent to me" without saying by whom is weak: mark UNSURE.
- CUSTOM_VIDEO: judge the stated requirement.

Also fill "disclosure" with the spoken and on-screen disclosures you found and when the brand is first endorsed.`;
}

function checklistHash(items) {
  return createHash('sha256').update(JSON.stringify(items.map((r) => [r.id, r.kind, r.description, r.value]))).digest('hex').slice(0, 16);
}

async function analyzeVideo(video, checklist, items) {
  const hash = checklistHash(items);
  const cached = one('SELECT * FROM video_analyses WHERE video_id = ? AND checklist_hash = ?', video.id, hash);
  if (cached) return { ...cached.result, cached: true, ms: cached.ms, model: cached.model };

  const model = config.gemini.videoModel;
  const { data, ms } = await generateJson({ model, schema: videoSchema, parts: [youtubePart(video.url), { text: videoPrompt(checklist, items) }] });
  run(
    'INSERT OR REPLACE INTO video_analyses (video_id, checklist_hash, model, result, ms) VALUES (?, ?, ?, ?, ?)',
    video.id,
    hash,
    model,
    JSON.stringify(data),
    ms,
  );
  return { ...data, cached: false, ms, model };
}

/** Code-side guards so a confident-sounding model answer can't pass without evidence. */
function judgeVideoItem(req, ai, analysis, video) {
  const r = ai ?? { status: 'UNSURE', timestamp: '', evidence: 'The model did not return this item' };
  const sec = toSeconds(r.timestamp);
  let status = { MET: 'met', NOT_MET: 'not_met' }[r.status] ?? 'unsure';
  let evidence = r.evidence;

  if (status === 'met' && (!r.evidence?.trim() || sec == null)) {
    status = 'unsure';
    evidence = `Model said met but gave no timestamp or evidence. ${r.evidence ?? ''}`.trim();
  }
  if (sec != null && video.durationSec && sec > video.durationSec + 2) {
    status = 'unsure';
    evidence = `Model cited ${r.timestamp}, past the end of the ${video.durationSec}s video. ${evidence}`;
  }
  if (req.kind === 'SHOW_PRODUCT' && req.value && status === 'met' && sec > Number(req.value)) {
    status = 'not_met';
    evidence = `Product first appears at ${r.timestamp}, brief says within ${req.value}s. ${evidence}`;
  }
  if (req.kind === 'DISCLOSE_IN_VIDEO') {
    const d = analysis.disclosure;
    const found = d?.spoken?.present || d?.on_screen?.present;
    if (!found && status === 'met') status = 'unsure';
    if (found) {
      const firstDisc = Math.min(...[d.spoken, d.on_screen].filter((x) => x.present).map((x) => toSeconds(x.timestamp) ?? Infinity));
      const endorse = toSeconds(d.first_endorsement_timestamp);
      if (status === 'met' && endorse != null && firstDisc > endorse + 3) {
        status = 'not_met';
        evidence = `Disclosure at ${Math.floor(firstDisc / 60)}:${String(firstDisc % 60).padStart(2, '0')} comes after the first endorsement at ${d.first_endorsement_timestamp}. ${evidence}`;
      }
    }
  }

  const howToFix = status === 'met' ? undefined : 'This is inside the video, so it needs a re-upload with the fix.';
  return { status, evidence, timestamp: r.timestamp || '', timestampSec: sec, howToFix };
}

// ---------- overall ----------

/**
 * @returns {Promise<{verdict, video, items, fixableInPlace, needsReupload, analysis}>}
 * verdict: PASS | FIX_NEEDED | HUMAN_REVIEW
 */
export async function verifyPost({ postUrl, checklist }) {
  const id = youtubeId(postUrl);
  if (!id) return issue('That is not a YouTube video link.');
  const video = await fetchVideo(id);
  if (!video) return issue('Video not found. It may be private, deleted or still processing.');
  if (video.privacy !== 'public') return issue(`Video is ${video.privacy}. It must be public to verify and to count as posted.`, video);

  const reqs = checklist.requirements;
  const videoItems = reqs.filter((r) => r.source === 'video');

  const analysis = videoItems.length ? await analyzeVideo(video, checklist, videoItems) : { results: [], disclosure: null };
  const aiById = Object.fromEntries((analysis.results ?? []).map((r) => [r.id, r]));

  const items = reqs.map((req) => {
    const res = req.source === 'video' ? judgeVideoItem(req, aiById[req.id], analysis, video) : checkMetadata(req, video);
    return { ...req, ...res, fixableInPlace: req.source === 'metadata' && res.status !== 'met' && req.kind !== 'MIN_DURATION_SECONDS' };
  });

  const failed = items.filter((i) => i.status === 'not_met');
  const unsure = items.filter((i) => i.status === 'unsure');
  const verdict = failed.length ? 'FIX_NEEDED' : unsure.length ? 'HUMAN_REVIEW' : 'PASS';

  return {
    verdict,
    video,
    items,
    needsReupload: failed.some((i) => !i.fixableInPlace),
    disclosure: analysis.disclosure,
    analysis: { model: analysis.model, ms: analysis.ms, cached: analysis.cached },
  };
}

function issue(message, video = null) {
  return {
    verdict: 'FIX_NEEDED',
    video,
    items: [{ id: 'r0', kind: 'POST_LIVE', source: 'metadata', description: 'Video is public on YouTube', status: 'not_met', evidence: message, howToFix: message, fixableInPlace: true }],
    needsReupload: false,
    disclosure: null,
    analysis: null,
  };
}
