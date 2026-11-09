// Limits that keep a public demo from being abused.
import { config } from './config.js';
import { one } from './db.js';

// PayPal sandbox accounts use these domains. In demo mode, money can only go to sandbox accounts.
const SANDBOX_EMAIL = /@(personal|business)\.example\.com$/i;

export function checkReceiver(email) {
  if (config.demo.enabled && !SANDBOX_EMAIL.test(email)) {
    throw Object.assign(new Error('In this demo, payouts can only go to PayPal sandbox accounts (…@personal.example.com)'), { status: 400 });
  }
}

/** Gemini video analyses started in the last 24h, to cap API spend. */
export function videoBudgetLeft() {
  const used = one("SELECT COUNT(*) AS n FROM video_analyses WHERE created_at > datetime('now', '-1 day')").n;
  return config.demo.dailyVideoAnalyses - used;
}

/** Simple per-IP limiter for write requests. */
export function rateLimit({ windowMs = 60_000, max = 40 } = {}) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    if (req.method === 'GET') return next();
    const key = req.ip;
    const n = (hits.get(key) ?? 0) + 1;
    hits.set(key, n);
    if (n > max) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    next();
  };
}
