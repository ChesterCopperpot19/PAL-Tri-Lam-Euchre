// Checks the durable-room store against a real Postgres: save, restore, update,
// delete, and the restore window. Refuses anything but a local database, so it
// can never touch production data. CI runs it against a throwaway Postgres.
// Run: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable npx tsx scripts/room-store-pg-check.ts

import { RoomManager } from '../src/server/rooms';
import { flushRooms, loadRecentRooms, saveRoomSoon, deleteRoomSoon, RESTORE_WINDOW_MS } from '../src/server/room-store';
import { getPool } from '../src/server/stats-store';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error('Refusing to run: DATABASE_URL must point at a local database.');
  process.exit(2);
}

async function main() {
  const rm = new RoomManager();
  const a = rm.create('host-a');
  a.seats[0] = { playerId: 'host-a', name: 'Ann', token: 'secret-a', socketId: 'sock', disconnectedAt: null, isBot: false };
  const b = rm.create('host-b');
  saveRoomSoon(a);
  saveRoomSoon(b);
  await flushRooms();

  let rooms = await loadRecentRooms();
  const codes = rooms.map((r) => r.code).sort();
  const want = [a.code, b.code].sort();
  if (JSON.stringify(codes) !== JSON.stringify(want)) throw new Error(`save/load: got ${codes}, want ${want}`);
  const ra = rooms.find((r) => r.code === a.code)!;
  if (ra.seats[0]?.token !== 'secret-a' || 'socketId' in (ra.seats[0] as object)) throw new Error('seat not saved as expected');

  // Update in place (upsert), then delete one.
  a.chatLog.push({ id: 'm1', from: 'Ann', fromSpectator: false, text: 'hi', ts: 1 });
  saveRoomSoon(a);
  deleteRoomSoon(b.code);
  await flushRooms();
  rooms = await loadRecentRooms();
  if (rooms.length !== 1 || rooms[0].chatLog.length !== 1) throw new Error('update/delete failed');

  // Rows older than the restore window are pruned on load.
  await getPool()!.query('UPDATE rooms SET updated_at = $1 WHERE code = $2', [Date.now() - RESTORE_WINDOW_MS - 1000, a.code]);
  rooms = await loadRecentRooms();
  if (rooms.length !== 0) throw new Error('stale room was restored');
  const left = await getPool()!.query('SELECT count(*)::int AS n FROM rooms');
  if (left.rows[0].n !== 0) throw new Error('stale room was not pruned');

  console.log('RESULT: pass (save, restore, upsert, delete, restore window)');
  await getPool()!.end();
}

main().catch(async (e) => {
  console.error('RESULT: FAIL', e.message);
  process.exit(1);
});
