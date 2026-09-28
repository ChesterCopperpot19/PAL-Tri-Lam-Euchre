// Durable rooms: games survive deploys and restarts.
//
// Each room is saved (debounced) after every broadcast to a `rooms` table in
// Postgres, or to data/rooms.json when there's no DATABASE_URL (offline dev).
// On SIGTERM, which Render sends before stopping, pending saves are flushed. On
// boot, rooms saved in the last six hours are restored.
//
// What's saved: the full game state (hands included), seats with their reclaim
// tokens, host, chat, bot level, and the game's bookkeeping. Tokens live only
// here and in memory; they never go into a client snapshot. Timers, sockets,
// spectators and rate limits aren't saved: sockets reconnect, and timers are
// re-armed by the normal broadcast path.

import fs from 'fs';
import path from 'path';
import type { GameState } from './engine/types';
import type { BotLevel, Room, Seat } from './rooms';
import type { ChatMessage } from '@/lib/shared-types';
import { getPool } from './stats-store';

export const RESTORE_WINDOW_MS = 6 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 1000;
const FORMAT = 1;

export type SavedRoom = {
  format: number;
  code: string;
  hostPlayerId: string;
  seats: (Omit<Seat, 'socketId' | 'disconnectedAt'> | null)[];
  state: GameState;
  chatLog: ChatMessage[];
  createdAt: number;
  startedTs?: number;
  statsRecorded: boolean;
  lastTrickCount: number;
  botLevel: BotLevel;
};

export function serializeRoom(room: Room): SavedRoom {
  return {
    format: FORMAT,
    code: room.code,
    hostPlayerId: room.hostPlayerId,
    seats: room.seats.map((s) => (s ? { playerId: s.playerId, name: s.name, token: s.token, isBot: s.isBot } : null)),
    state: room.state,
    chatLog: room.chatLog.slice(-50),
    createdAt: room.createdAt,
    startedTs: room.startedTs,
    statsRecorded: room.statsRecorded,
    lastTrickCount: room.lastTrickCount,
    botLevel: room.botLevel,
  };
}

// ---- storage backends ------------------------------------------------------

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  const p = getPool()!;
  if (!schemaReady) {
    schemaReady = p
      .query(
        `CREATE TABLE IF NOT EXISTS rooms (
           code       TEXT PRIMARY KEY,
           state      JSONB  NOT NULL,
           updated_at BIGINT NOT NULL
         );`,
      )
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}

const FILE = path.join(process.cwd(), 'data', 'rooms.json');
type FileRooms = Record<string, { state: SavedRoom; updatedAt: number }>;
function readFile(): FileRooms {
  try {
    return fs.existsSync(FILE) ? (JSON.parse(fs.readFileSync(FILE, 'utf8')) as FileRooms) : {};
  } catch {
    return {};
  }
}
function writeFile(rooms: FileRooms): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rooms));
  fs.renameSync(tmp, FILE); // atomic: a crash mid-write never leaves half a file
}

async function writeRooms(saves: SavedRoom[], deletes: string[]): Promise<void> {
  const now = Date.now();
  const p = getPool();
  if (!p) {
    const rooms = readFile();
    for (const s of saves) rooms[s.code] = { state: s, updatedAt: now };
    for (const c of deletes) delete rooms[c];
    writeFile(rooms);
    return;
  }
  await ensureSchema();
  for (const s of saves)
    await p.query(
      `INSERT INTO rooms (code, state, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
      [s.code, JSON.stringify(s), now],
    );
  if (deletes.length) await p.query(`DELETE FROM rooms WHERE code = ANY($1)`, [deletes]);
}

/** Rooms saved within the restore window, oldest rows pruned. */
export async function loadRecentRooms(): Promise<SavedRoom[]> {
  const cutoff = Date.now() - RESTORE_WINDOW_MS;
  const p = getPool();
  if (!p) {
    const rooms = readFile();
    const keep: FileRooms = {};
    for (const [code, r] of Object.entries(rooms)) if (r.updatedAt >= cutoff) keep[code] = r;
    if (Object.keys(keep).length !== Object.keys(rooms).length) writeFile(keep);
    return Object.values(keep)
      .map((r) => r.state)
      .filter((s) => s.format === FORMAT);
  }
  await ensureSchema();
  await p.query(`DELETE FROM rooms WHERE updated_at < $1`, [cutoff]);
  const res = await p.query<{ state: SavedRoom }>(`SELECT state FROM rooms WHERE updated_at >= $1`, [cutoff]);
  return res.rows.map((r) => r.state).filter((s) => s.format === FORMAT);
}

// ---- debounced writes --------------------------------------------------------

const pendingSave = new Map<string, Room>();
const pendingDelete = new Set<string>();
let timer: NodeJS.Timeout | null = null;
let writing: Promise<void> = Promise.resolve();

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushRooms();
  }, SAVE_DEBOUNCE_MS);
  timer.unref();
}

/** Save this room soon (coalesces bursts of broadcasts into one write). */
export function saveRoomSoon(room: Room): void {
  pendingDelete.delete(room.code);
  pendingSave.set(room.code, room);
  schedule();
}

/** Forget this room (it was closed). */
export function deleteRoomSoon(code: string): void {
  pendingSave.delete(code);
  pendingDelete.add(code);
  schedule();
}

/** Write everything pending now. Serialised so writes never interleave. */
export function flushRooms(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const saves = [...pendingSave.values()].map(serializeRoom);
  const deletes = [...pendingDelete];
  pendingSave.clear();
  pendingDelete.clear();
  if (!saves.length && !deletes.length) return writing;
  writing = writing
    .then(() => writeRooms(saves, deletes))
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error('failed to save rooms:', (e as Error).message);
    });
  return writing;
}
