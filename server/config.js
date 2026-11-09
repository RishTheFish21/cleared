// Central config read from the environment (.env locally, dashboard on Render).

// Values pasted into a hosting dashboard often pick up spaces, newlines or quotes.
for (const k of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_TEST_RECEIVER', 'YOUTUBE_API_KEY', 'GEMINI_API_KEY']) {
  if (process.env[k]) process.env[k] = process.env[k].trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}

export const config = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || 'data/cleared.db',

  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    apiBase: process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com',
  },

  youtubeApiKey: process.env.YOUTUBE_API_KEY,

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    // Video analysis model (needs YouTube URL input).
    // 3.5-flash matched 3.8-flash's verdicts on our test videos in ~10s instead of 1-3 min.
    videoModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    // Fast text model for brief parsing and fix messages.
    // Lite parsed our test brief identically to 3.8-flash in ~1.5s vs ~2 minutes.
    textModel: process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite',
  },

  // Hard safety limits. The AI never sets amounts; these cap what code can pay.
  limits: {
    maxPayoutCents: Number(process.env.MAX_PAYOUT_CENTS || 50_000), // $500 per deliverable
    humanApprovalAboveCents: Number(process.env.HUMAN_APPROVAL_ABOVE_CENTS || 100_000),
  },

  // Public demo safety: sandbox-only receivers, a reset button, a daily cap on video analyses.
  demo: {
    enabled: process.env.DEMO_MODE === 'true',
    receiver: process.env.PAYPAL_TEST_RECEIVER,
    dailyVideoAnalyses: Number(process.env.DAILY_VIDEO_ANALYSES || 150),
  },

  // Seconds between automatic re-checks of a FIX_NEEDED deliverable.
  recheckSeconds: Number(process.env.RECHECK_SECONDS || 120),
};

export function missingKeys() {
  const need = {
    PAYPAL_CLIENT_ID: config.paypal.clientId,
    PAYPAL_CLIENT_SECRET: config.paypal.clientSecret,
    YOUTUBE_API_KEY: config.youtubeApiKey,
    GEMINI_API_KEY: config.gemini.apiKey,
  };
  return Object.entries(need)
    .filter(([, v]) => !v)
    .map(([k]) => k);
}
