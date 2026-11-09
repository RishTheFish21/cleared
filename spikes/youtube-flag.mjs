// Test 2: does the YouTube Data API give us the "includes paid promotion" flag?
// Usage: npm run spike:youtube [-- <url-or-id> ...]   (defaults to the two test videos in .env)
import { requireEnv, youtubeId, saveOutput, pass, fail } from './lib.mjs';

const { YOUTUBE_API_KEY } = requireEnv('YOUTUBE_API_KEY');
const inputs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [process.env.TEST_VIDEO_COMPLIANT, process.env.TEST_VIDEO_NONCOMPLIANT].filter(Boolean);
if (!inputs.length) {
  console.error('Give a video URL as an argument, or set TEST_VIDEO_COMPLIANT in .env');
  process.exit(2);
}

const ids = inputs.map(youtubeId);
const PARTS = ['snippet', 'status', 'statistics', 'contentDetails', 'paidProductPlacementDetails'];

async function fetchVideos(parts) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', parts.join(','));
  url.searchParams.set('id', ids.join(','));
  const res = await fetch(url, { headers: { 'X-Goog-Api-Key': YOUTUBE_API_KEY } });
  return { ok: res.ok, status: res.status, body: await res.json() };
}

let res = await fetchVideos(PARTS);
let flagPartSupported = true;
if (!res.ok && JSON.stringify(res.body).includes('part')) {
  // The API rejected an unknown part. Retry without it so we still learn something.
  console.log('• API rejected paidProductPlacementDetails; retrying without it.');
  flagPartSupported = false;
  res = await fetchVideos(PARTS.filter((p) => p !== 'paidProductPlacementDetails'));
}
if (!res.ok) {
  console.log(JSON.stringify(res.body, null, 2));
  fail(`YouTube API returned ${res.status}. Is "YouTube Data API v3" enabled for this key?`);
  process.exit();
}

const file = saveOutput('youtube-videos.json', res.body);
let sawFlag = false;

for (const id of ids) {
  const v = res.body.items?.find((x) => x.id === id);
  console.log(`\n— ${id}`);
  if (!v) {
    console.log('  Not returned (private, deleted, or wrong ID).');
    continue;
  }
  const flag = v.paidProductPlacementDetails?.hasPaidProductPlacement;
  if (typeof flag === 'boolean') sawFlag = true;
  console.log(`  title:          ${v.snippet.title}`);
  console.log(`  privacy:        ${v.status.privacyStatus}   embeddable: ${v.status.embeddable}`);
  console.log(`  views:          ${v.statistics?.viewCount ?? 'hidden'}   duration: ${v.contentDetails?.duration}`);
  console.log(`  paid promotion: ${flag === undefined ? '(field missing)' : flag}`);
  const desc = v.snippet.description ?? '';
  console.log(`  description first line: ${JSON.stringify(desc.split('\n')[0].slice(0, 120))}`);
  console.log(`  #ad / sponsored in description: ${/#ad\b|#sponsored|sponsored by|paid partnership/i.test(desc)}`);
}

console.log(`\n• Raw response saved to ${file}`);
if (sawFlag) pass('hasPaidProductPlacement is readable with an API key.');
else if (!flagPartSupported) fail('This API does not accept paidProductPlacementDetails. Plan B: rely on description + Gemini only.');
else
  fail(
    'Request worked but the paid-promotion field never came back.\n' +
      '        It may need OAuth as the channel owner, or only appear when ticked. Tick it on one test video and re-run.',
  );
