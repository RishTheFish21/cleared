import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  brand         TEXT NOT NULL,
  brief_text    TEXT NOT NULL,
  checklist     TEXT,              -- JSON produced by the brief parser
  budget_cents  INTEGER NOT NULL DEFAULT 0,
  funded_cents  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS creators (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  handle        TEXT,
  paypal_email  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One sponsored post a creator owes a campaign.
-- status: due | submitted | verifying | fix_needed | human_review | verified | paying | paid | payout_failed
CREATE TABLE IF NOT EXISTS deliverables (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id),
  creator_id    TEXT NOT NULL REFERENCES creators(id),
  title         TEXT NOT NULL,
  due_date      TEXT NOT NULL,
  fee_cents     INTEGER NOT NULL,
  post_url      TEXT,
  status        TEXT NOT NULL DEFAULT 'due',
  fix_message   TEXT,
  next_check_at TEXT,
  submitted_at  TEXT,
  verified_at   TEXT,
  paid_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every verification run, with full evidence.
CREATE TABLE IF NOT EXISTS checks (
  id             TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  verdict        TEXT,             -- PASS | FIX_NEEDED | HUMAN_REVIEW | ERROR
  result         TEXT,             -- JSON
  error          TEXT,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT
);

CREATE TABLE IF NOT EXISTS payouts (
  id             TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL UNIQUE REFERENCES deliverables(id), -- one payout per deliverable
  amount_cents   INTEGER NOT NULL,
  receiver       TEXT NOT NULL,
  batch_id       TEXT,
  item_id        TEXT,
  status         TEXT NOT NULL DEFAULT 'CREATED',
  raw            TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only audit trail shown in the UI.
CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id    TEXT,
  deliverable_id TEXT,
  type           TEXT NOT NULL,
  message        TEXT NOT NULL,
  data           TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`);

export const newId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
export const now = () => new Date().toISOString();

const JSON_COLS = new Set(['checklist', 'result', 'raw', 'data']);

/** Parse JSON columns and drop SQLite's null prototype. */
export function hydrate(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = JSON_COLS.has(k) && typeof v === 'string' ? JSON.parse(v) : v;
  return out;
}

export const one = (sql, ...params) => hydrate(db.prepare(sql).get(...params));
export const all = (sql, ...params) => db.prepare(sql).all(...params).map(hydrate);
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export function insert(table, row) {
  const cols = Object.keys(row);
  const vals = cols.map((c) => (JSON_COLS.has(c) && row[c] != null && typeof row[c] !== 'string' ? JSON.stringify(row[c]) : row[c]));
  run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...vals);
  return row;
}

export function update(table, id, fields) {
  const cols = Object.keys(fields);
  const vals = cols.map((c) => (JSON_COLS.has(c) && fields[c] != null && typeof fields[c] !== 'string' ? JSON.stringify(fields[c]) : fields[c]));
  const touch = ['deliverables', 'payouts'].includes(table) ? ", updated_at = datetime('now')" : '';
  run(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}${touch} WHERE id = ?`, ...vals, id);
}

export function logEvent({ campaignId = null, deliverableId = null, type, message, data = null }) {
  run(
    'INSERT INTO events (campaign_id, deliverable_id, type, message, data) VALUES (?, ?, ?, ?, ?)',
    campaignId,
    deliverableId,
    type,
    message,
    data == null ? null : JSON.stringify(data),
  );
  console.log(`[${type}] ${message}`);
}
