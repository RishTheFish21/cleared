// Reads public facts about a YouTube video with the official Data API.
import { config } from './config.js';

export function youtubeId(input) {
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let url;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.hostname === 'youtu.be') return url.pathname.slice(1, 12) || null;
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  if (url.searchParams.get('v')) return url.searchParams.get('v');
  return url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1] ?? null;
}

/** "PT1M5S" -> 65 */
export function isoDurationToSeconds(iso = '') {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** Returns null if the video doesn't exist or isn't visible to the API. */
export async function fetchVideo(id) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,status,statistics,contentDetails,paidProductPlacementDetails');
  url.searchParams.set('id', id);
  const res = await fetch(url, { headers: { 'X-Goog-Api-Key': config.youtubeApiKey } });
  const body = await res.json();
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${body.error?.message}`);
  const v = body.items?.[0];
  if (!v) return null;
  return {
    id: v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    title: v.snippet.title,
    description: v.snippet.description ?? '',
    channelTitle: v.snippet.channelTitle,
    publishedAt: v.snippet.publishedAt,
    thumbnail: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.default?.url,
    privacy: v.status.privacyStatus,
    embeddable: v.status.embeddable,
    views: v.statistics?.viewCount != null ? Number(v.statistics.viewCount) : null,
    likes: v.statistics?.likeCount != null ? Number(v.statistics.likeCount) : null,
    durationSec: isoDurationToSeconds(v.contentDetails?.duration),
    paidPromotion: v.paidProductPlacementDetails?.hasPaidProductPlacement ?? null,
  };
}
