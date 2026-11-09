// Test 3: can Gemini watch a public YouTube video and return a structured,
// timestamped sponsorship-disclosure verdict?
// Usage: npm run spike:gemini [-- <url> ...]   (defaults to the two test videos in .env)
// Set BRAND_NAME in .env to change the brand it looks for (default "Juniper").
import { requireEnv, youtubeId, saveOutput, pass, fail, sleep } from './lib.mjs';

const { GEMINI_API_KEY } = requireEnv('GEMINI_API_KEY');
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const BRAND = process.env.BRAND_NAME || 'Juniper';

const args = process.argv.slice(2);
const videos = args.length
  ? args.map((url) => ({ url, expect: null }))
  : [
      { url: process.env.TEST_VIDEO_COMPLIANT, expect: true },
      { url: process.env.TEST_VIDEO_NONCOMPLIANT, expect: false },
    ].filter((v) => v.url);
if (!videos.length) {
  console.error('Give a video URL as an argument, or set TEST_VIDEO_COMPLIANT / TEST_VIDEO_NONCOMPLIANT in .env');
  process.exit(2);
}

const evidence = {
  type: 'OBJECT',
  properties: {
    present: { type: 'BOOLEAN' },
    timestamp: { type: 'STRING', description: 'MM:SS of first occurrence, empty if absent' },
    quote: { type: 'STRING', description: 'Exact words spoken or text shown' },
  },
  required: ['present', 'timestamp', 'quote'],
};

const schema = {
  type: 'OBJECT',
  properties: {
    brand_mentioned: evidence,
    product_shown: evidence,
    spoken_disclosure: evidence,
    on_screen_disclosure: evidence,
    disclosure_before_endorsement: {
      type: 'BOOLEAN',
      description: 'True if a disclosure appears before or at the first brand endorsement',
    },
    verdict: { type: 'STRING', enum: ['PASS', 'FIX_NEEDED', 'HUMAN_REVIEW'] },
    confidence: { type: 'NUMBER', description: '0 to 1' },
    reasons: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'brand_mentioned',
    'product_shown',
    'spoken_disclosure',
    'on_screen_disclosure',
    'disclosure_before_endorsement',
    'verdict',
    'confidence',
    'reasons',
  ],
};

const prompt = `You are checking a sponsored video for the brand "${BRAND}" against FTC endorsement disclosure guidance.
Watch the whole video, including audio. Report only what you actually see or hear; do not guess.
- brand_mentioned: is "${BRAND}" said aloud or shown? First timestamp and quote.
- product_shown: is a ${BRAND} product visibly shown? First timestamp and what is shown.
- spoken_disclosure: does the creator SAY the video is sponsored/paid/an ad (e.g. "sponsored by", "paid partnership", "this is an ad")? Exact words.
- on_screen_disclosure: is a disclosure shown as TEXT overlaid in the video (not YouTube's own UI)? Exact text.
- disclosure_before_endorsement: did a disclosure come before or at the first endorsement of ${BRAND}?
- verdict: PASS only if the brand is mentioned AND a clear disclosure (spoken or on-screen) appears no later than the first endorsement. FIX_NEEDED if a disclosure is missing or late. HUMAN_REVIEW if you are unsure.
Timestamps use MM:SS.`;

async function analyze(url) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ file_data: { file_uri: url } }, { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message ?? JSON.stringify(body)}`);
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  return { verdict: JSON.parse(text), usage: body.usageMetadata };
}

// Gemini returns 503/429 when busy; retry those with backoff.
async function analyzeWithRetry(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      return await analyze(url);
    } catch (err) {
      if (i >= tries || !/Gemini (503|429|500)/.test(err.message)) throw err;
      const wait = 5000 * 2 ** (i - 1);
      console.log(`  busy (${err.message.slice(0, 10)}), retrying in ${wait / 1000}s...`);
      await sleep(wait);
    }
  }
}

const line = (label, e) =>
  console.log(`  ${label.padEnd(22)} ${e.present ? '✓' : '✗'} ${e.timestamp || ''} ${e.quote ? JSON.stringify(e.quote) : ''}`);

let allOk = true;
for (const v of videos) {
  const url = `https://www.youtube.com/watch?v=${youtubeId(v.url)}`;
  console.log(`\n— ${url}  (model ${MODEL}, brand "${BRAND}")`);
  const t0 = Date.now();
  try {
    const { verdict: r, usage } = await analyzeWithRetry(url);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    line('brand mentioned', r.brand_mentioned);
    line('product shown', r.product_shown);
    line('spoken disclosure', r.spoken_disclosure);
    line('on-screen disclosure', r.on_screen_disclosure);
    console.log(`  disclosure first?      ${r.disclosure_before_endorsement}`);
    console.log(`  VERDICT                ${r.verdict}  (confidence ${r.confidence})`);
    r.reasons.forEach((x) => console.log(`    - ${x}`));
    console.log(`  took ${secs}s, ${usage?.totalTokenCount ?? '?'} tokens`);
    saveOutput(`gemini-${youtubeId(url)}.json`, r);

    if (v.expect !== null) {
      const disclosed = r.spoken_disclosure.present || r.on_screen_disclosure.present;
      const ok = disclosed === v.expect;
      console.log(`  expected disclosure=${v.expect}: ${ok ? 'matches' : 'MISMATCH'}`);
      allOk &&= ok;
    }
  } catch (err) {
    console.log(`  ${err.message}`);
    if (/private|not.*public|permission|INVALID_ARGUMENT/i.test(err.message))
      console.log('  (Gemini only reads PUBLIC YouTube videos. Unlisted/private will fail.)');
    allOk = false;
  }
}

if (allOk) pass('Gemini returned structured, timestamped verdicts that match expectations.');
else fail('At least one video failed or got the wrong answer. Check timestamps against the video by hand.');
