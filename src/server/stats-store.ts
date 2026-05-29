// Simple file-backed store for completed matches (all-time stats).
//
// NOTE on persistence: this writes to data/matches.json on the server's local
// disk. That survives server restarts, but on hosts with an EPHEMERAL disk
// (e.g. Render's free tier) the file is wiped on every redeploy. For true
// "in perpetuity" history across deploys, point this at a persistent disk or
// an external database (see README / ask to wire up Postgres).

import fs from 'fs';
import path from 'path';
import type { MatchRecord } from '@/lib/shared-types';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'matches.json');
const MAX_MATCHES = 5000;

let matches: MatchRecord[] = [];
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  try {
    if (fs.existsSync(FILE)) {
      const raw = fs.readFileSync(FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) matches = parsed;
    }
  } catch {
    matches = [];
  }
  loaded = true;
}

export function recordMatch(record: MatchRecord): void {
  ensureLoaded();
  matches.push(record);
  if (matches.length > MAX_MATCHES) matches = matches.slice(-MAX_MATCHES);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(matches));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('failed to persist match:', (e as Error).message);
  }
}

export function getMatches(): MatchRecord[] {
  ensureLoaded();
  return matches;
}
