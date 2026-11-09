// Minimal Gemini client: structured JSON output, YouTube URL input, retries on overload.
import { config } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([429, 500, 503, 504]);
// A single call that hasn't answered by now is treated as failed, so a check can't hang forever.
const TIMEOUT_MS = 90_000;

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.model
 * @param {Array}  opts.parts   Gemini content parts (text, file_data, ...)
 * @param {object} opts.schema  Gemini response schema (OpenAPI subset)
 * @param {string} [opts.system]
 * @returns {Promise<{data: any, usage: object, ms: number}>}
 */
export async function generateJson({ model, parts, schema, system, temperature = 0, tries = 4 }) {
  const t0 = Date.now();
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const json = await generateContent(model, body, tries);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new GeminiError(`Empty response (finish reason ${json.candidates?.[0]?.finishReason})`, 200);
  return { data: JSON.parse(text), usage: json.usageMetadata, ms: Date.now() - t0 };
}

/** Raw generateContent call with retries on overload. Returns the response JSON. */
export async function generateContent(model, body, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Timeouts and dropped connections count as retryable (504).
      const reason = err.name === 'TimeoutError' ? `no answer after ${TIMEOUT_MS / 1000}s` : err.message;
      if (attempt >= tries) throw new GeminiError(`Gemini ${model}: ${reason}`, 504);
      await sleep(3000);
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    // A daily quota won't clear in seconds, so don't burn time retrying it.
    const dailyQuota = res.status === 429 && /per day|PerDay/i.test(JSON.stringify(json));
    if (dailyQuota) throw new GeminiError(`Gemini daily quota reached for ${model}. ${msg.split('\n')[0]}`, 429);
    if (!RETRYABLE.has(res.status) || attempt >= tries) throw new GeminiError(`Gemini ${res.status}: ${msg}`, res.status);
    await sleep(3000 * 2 ** (attempt - 1));
  }
}

export const youtubePart = (url) => ({ file_data: { file_uri: url } });

/** Model text tends to arrive with curly quotes and em dashes; show plain punctuation instead. */
export const plainText = (s) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s*—\s*/g, ', ').replace(/…/g, '...');
