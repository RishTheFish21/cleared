import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, missingKeys } from './config.js';
import { api } from './routes.js';
import { startWorker } from './pipeline.js';
import { rateLimit } from './guards.js';
import { seedDemo } from './seed.js';
import { one } from './db.js';

const app = express();
app.set('trust proxy', 1); // behind Render's proxy, so req.ip is the client
app.use(express.json({ limit: '200kb' }));
app.use('/api', rateLimit());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    demoMode: config.demo.enabled,
    // Sandbox-only address, shown so demo users can add creators that can actually be paid.
    demoReceiver: config.demo.enabled ? config.demo.receiver : undefined,
    missingKeys: missingKeys(),
  });
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
  if (config.demo.enabled && !one('SELECT id FROM campaigns LIMIT 1')) {
    seedDemo({ receiver: config.demo.receiver });
    console.log('Seeded demo data');
  }
  startWorker();
});
