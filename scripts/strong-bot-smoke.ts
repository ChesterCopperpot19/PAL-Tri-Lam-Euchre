// End-to-end check of the strong bot on the real socket handlers: one player
// joins, the host fills three strong bots, and a full hand is played. The bots'
// decisions must come from the worker thread (loaded under tsx, as in
// production), with no fallbacks to the heuristic bot.
// Run: npx tsx scripts/strong-bot-smoke.ts   (exit 0 = pass)

import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as client } from 'socket.io-client';
import { attachHandlers } from '../src/server/handlers';
import { botStats } from '../src/server/bot-pool';
import type { RoomSnapshot } from '../src/lib/shared-types';

setTimeout(() => {
  console.log('WATCHDOG: hand did not finish in 90s');
  process.exit(2);
}, 90_000).unref();

const http = createServer();
const io = new Server(http, { path: '/api/socket' });
attachHandlers(io as any);

http.listen(0, async () => {
  const url = `http://localhost:${(http.address() as any).port}`;
  const c = client(url, { path: '/api/socket' });
  await new Promise<void>((r) => c.on('connect', () => r()));
  let snap: RoomSnapshot | null = null;
  c.on('room:snapshot', (s: RoomSnapshot) => {
    snap = s;
    act(s);
  });
  c.on('room:error', (e: unknown) => console.log('room:error', e));

  // The player: pass when possible, call the first legal suit when stuck as
  // dealer, discard/play the first legal card.
  function act(s: RoomSnapshot) {
    const st = s.state;
    if (st.viewerSeat === null || st.turn !== st.viewerSeat) return;
    if (st.phase === 'BIDDING_1') c.emit('bid:pass');
    else if (st.phase === 'BIDDING_2') {
      if (st.dealer !== st.viewerSeat) c.emit('bid:pass');
      else c.emit('bid:call', { suit: (['H', 'D', 'C', 'S'] as const).find((x) => x !== st.upcard!.suit)!, alone: false });
    } else if (st.phase === 'DEALER_DISCARD') c.emit('discard:card', { cardId: st.seats[st.viewerSeat].hand![0].id });
    else if (st.phase === 'PLAYING' && st.legalPlayIds.length) c.emit('play:card', { cardId: st.legalPlayIds[0] });
  }

  const join: any = await new Promise((r) => c.emit('room:join', { code: '', name: 'Tester', playerId: 'tester-1' }, r));
  if (!join.ok) throw new Error('join failed');
  c.emit('room:fillBots');
  await new Promise((r) => setTimeout(r, 200));
  if (snap!.botLevel !== 'strong') throw new Error('rooms should default to strong bots');
  c.emit('room:start');

  // Wait for the first hand to be scored.
  const t0 = Date.now();
  while (!snap || (snap as RoomSnapshot).state.phase !== 'HAND_END') await new Promise((r) => setTimeout(r, 200));
  const stats = botStats();
  console.log(`hand finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('bot stats:', JSON.stringify(stats.all));
  const ok = stats.all.decisions >= 10 && stats.all.fallbacks === 0;
  console.log(ok ? 'RESULT: pass' : 'RESULT: FAIL (expected strong decisions with no fallbacks)');
  process.exit(ok ? 0 : 1);
});
