import express from 'express';
import { config, missingKeys } from './config.js';
import { api } from './routes.js';
import { startWorker } from './pipeline.js';

const app = express();
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, missingKeys: missingKeys() });
});
app.use('/api', api);

app.listen(config.port, () => {
  console.log(`Cleared running on http://localhost:${config.port}`);
  const missing = missingKeys();
  if (missing.length) console.warn(`Missing env: ${missing.join(', ')}`);
  startWorker();
});
