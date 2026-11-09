// Drafts a short, friendly message telling the creator exactly what to fix.
import { generateJson } from './gemini.js';
import { config } from './config.js';

const schema = {
  type: 'OBJECT',
  properties: { message: { type: 'STRING' } },
  required: ['message'],
};

export async function draftFixMessage({ creatorName, brand, videoTitle, failedItems, needsReupload }) {
  const list = failedItems.map((i) => `- ${i.description}: ${i.evidence}${i.howToFix ? ` (fix: ${i.howToFix})` : ''}`).join('\n');
  try {
    const { data } = await generateJson({
      model: config.gemini.textModel,
      schema,
      temperature: 0.4,
      system:
        'You write short, warm, specific messages from a brand partnerships team to a creator. Plain text, no markdown, under 90 words. Lead with thanks, then list each fix as a short step. Mention timestamps where given. If something is inside the video, explain kindly that it needs a re-upload. If every fix is in the description or settings, say payment goes out automatically once it is fixed. Never mention AI.',
      parts: [
        {
          text: `Creator: ${creatorName}\nBrand: ${brand}\nVideo: "${videoTitle}"\nNeeds re-upload: ${needsReupload}\nWhat failed:\n${list}`,
        },
      ],
    });
    return data.message.trim();
  } catch {
    return fallback({ creatorName, brand, failedItems, needsReupload });
  }
}

function fallback({ creatorName, brand, failedItems, needsReupload }) {
  const steps = failedItems.map((i) => `• ${i.howToFix ?? i.description}`).join('\n');
  const end = needsReupload
    ? 'One of these is inside the video, so please re-upload and send us the new link.'
    : 'Once that is done, payment goes out automatically.';
  return `Hi ${creatorName}, thanks for the ${brand} video! A couple of quick fixes before we can pay:\n${steps}\n${end}`;
}
