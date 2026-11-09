// Central config read from the environment (.env locally, dashboard on Render).
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
    videoModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    // Fast text model for brief parsing and fix messages.
    textModel: process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  },

  // Hard safety limits. The AI never sets amounts; these cap what code can pay.
  limits: {
    maxPayoutCents: Number(process.env.MAX_PAYOUT_CENTS || 50_000), // $500 per deliverable
    humanApprovalAboveCents: Number(process.env.HUMAN_APPROVAL_ABOVE_CENTS || 100_000),
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
