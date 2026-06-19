// Persistence for completed matches (all-time stats).
//
// Uses Postgres when DATABASE_URL is set — durable across server restarts and
// redeploys (e.g. Neon's free tier). Falls back to a local JSON file when no
// DATABASE_URL is present, so local dev still works without a database.
//
// The public API is async (Postgres I/O); callers await it.

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import type { MatchRecord } from '@/lib/shared-types';

const MAX_MATCHES = 5000;

// ---- Postgres mode ---------------------------------------------------------

// `undefined` = not yet resolved; `null` = no DATABASE_URL (file fallback).
let pool: Pool | null | undefined;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool | null {
  if (pool !== undefined) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    pool = null;
    return null;
  }
  pool = new Pool({
    connectionString: url,
    // Neon (and most managed Postgres) require TLS. The cert chain is valid,
    // but we don't pin it — this keeps connections simple and portable.
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  pool.on('error', (e) => {
    // eslint-disable-next-line no-console
    console.error('postgres pool error:', e.message);
  });
  return pool;
}

function ensureSchema(p: Pool): Promise<void> {
  if (!schemaReady) {
    schemaReady = p
      .query(
        `CREATE TABLE IF NOT EXISTS matches (
           id   TEXT PRIMARY KEY,
           ts   BIGINT NOT NULL,
           data JSONB  NOT NULL
         );`
      )
      .then(() => undefined)
      .catch((e) => {
        // Reset so a later call can retry after a transient failure.
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}

// ---- File fallback mode ----------------------------------------------------

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'matches.json');
let fileMatches: MatchRecord[] = [];
let fileLoaded = false;

function fileEnsureLoaded(): void {
  if (fileLoaded) return;
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (Array.isArray(parsed)) fileMatches = parsed;
    }
  } catch {
    fileMatches = [];
  }
  fileLoaded = true;
}

function fileRecord(record: MatchRecord): void {
  fileEnsureLoaded();
  fileMatches.push(record);
  if (fileMatches.length > MAX_MATCHES) fileMatches = fileMatches.slice(-MAX_MATCHES);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(fileMatches));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('failed to persist match to file:', (e as Error).message);
  }
}

// ---- Public API ------------------------------------------------------------

export async function recordMatch(record: MatchRecord): Promise<void> {
  const p = getPool();
  if (!p) {
    fileRecord(record);
    return;
  }
  await ensureSchema(p);
  await p.query(
    `INSERT INTO matches (id, ts, data)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [record.id, record.ts, JSON.stringify(record)]
  );
  // Cap table growth — keep the most recent MAX_MATCHES rows.
  await p.query(
    `DELETE FROM matches
     WHERE id IN (SELECT id FROM matches ORDER BY ts DESC OFFSET $1)`,
    [MAX_MATCHES]
  );
}

export async function getMatches(): Promise<MatchRecord[]> {
  const p = getPool();
  if (!p) {
    fileEnsureLoaded();
    return fileMatches;
  }
  await ensureSchema(p);
  const res = await p.query<{ data: MatchRecord }>(
    `SELECT data FROM matches ORDER BY ts ASC LIMIT $1`,
    [MAX_MATCHES]
  );
  // JSONB columns come back already parsed.
  return res.rows.map((r) => r.data);
}

/** Delete one match by id. Returns true if a row was removed. */
export async function deleteMatch(id: string): Promise<boolean> {
  const p = getPool();
  if (!p) {
    fileEnsureLoaded();
    const before = fileMatches.length;
    fileMatches = fileMatches.filter((m) => m.id !== id);
    if (fileMatches.length === before) return false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(fileMatches));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('failed to persist delete to file:', (e as Error).message);
    }
    return true;
  }
  await ensureSchema(p);
  const res = await p.query('DELETE FROM matches WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}
