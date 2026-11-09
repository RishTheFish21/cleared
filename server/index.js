import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, missingKeys } from './config.js';
import { api } from './routes.js';
import { startWorker } from './pipeline.js';

const app = express();
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, missingKeys: missingKeys() });
});
app.use('/api', api);

// Serve the built frontend, with client-side routes falling back to index.html.
const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`Cleared running on http://localhost:${config.port}`);
  const missing = missingKeys();
  if (missing.length) console.warn(`Missing env: ${missing.join(', ')}`);
  startWorker();
});
