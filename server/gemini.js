// Minimal Gemini client: structured JSON output, YouTube URL input, retries on overload.
import { config } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([429, 500, 503]);

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

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new GeminiError(`Empty response (finish reason ${json.candidates?.[0]?.finishReason})`, 200);
      return { data: JSON.parse(text), usage: json.usageMetadata, ms: Date.now() - t0 };
    }
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    if (!RETRYABLE.has(res.status) || attempt >= tries) throw new GeminiError(`Gemini ${res.status}: ${msg}`, res.status);
    await sleep(5000 * 2 ** (attempt - 1));
  }
}

export const youtubePart = (url) => ({ file_data: { file_uri: url } });
