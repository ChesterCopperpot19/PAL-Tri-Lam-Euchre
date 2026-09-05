// Hardening check: fires malformed packets at every socket event, then verifies
// seat-reclaim tokens, the per-IP room-creation cap, and the stats:add key gate.
// Run: npx tsx scripts/socket-fuzz-check.ts   (exit 0 = no uncaught errors)
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as client } from 'socket.io-client';
import { attachHandlers } from '../src/server/handlers';

let uncaught = 0;
setTimeout(() => { console.log('WATCHDOG: script stalled'); process.exit(2); }, 25_000).unref();
const step = (m: string) => console.log('… ' + m);
process.on('uncaughtException', (e) => { uncaught++; console.log('UNCAUGHT:', e.message); });
process.on('unhandledRejection', (e) => { uncaught++; console.log('UNHANDLED REJECTION:', (e as Error)?.message ?? e); });

const http = createServer();
const io = new Server(http, { path: '/api/socket' });
attachHandlers(io as any);

const events = ['room:join','room:start','room:nextHand','room:rematch','room:promote','room:moveSeat','room:addBot','room:removeBot','room:fillBots','rooms:list','stats:get','stats:hands','stats:add','stats:delete','bid:order','bid:pass','bid:call','farmers:redeal','discard:card','play:card','chat:send'];
const payloads: unknown[] = [undefined, null, 0, 'x', [], {}, { seat: 1.5 }, { seat: 'length' }, { seat: -1 }, { seat: '__proto__' }, { suit: 'X', alone: 1 }, { cardId: { length: 3 } }, { text: { length: 5 } }, { playerId: {}, seat: 7 }, { id: 5, key: null }, { code: [], name: {}, playerId: 42 }];

http.listen(0, async () => {
  const port = (http.address() as any).port;
  const url = `http://localhost:${port}`;
  const c = client(url, { path: '/api/socket' });
  await new Promise<void>((r) => c.on('connect', () => r()));
  let errors = 0; c.on('room:error', () => errors++);
  // 1) every event × every payload, with and without an ack
  for (const ev of events) for (const p of payloads) { c.emit(ev, p); c.emit(ev, p, () => {}); c.emit(ev); }
  await new Promise((r) => setTimeout(r, 800));
  console.log(`fuzz: ${events.length * payloads.length * 3} packets, ${errors} room:error replies, socket connected=${c.connected}`);

  // 2) legit join, then a SECOND socket tries to hijack the seat with the public playerId
  step('fuzz done, opening second socket');
  const c2 = client(url, { path: '/api/socket' });
  await new Promise<void>((r) => c2.on('connect', () => r()));
  step('c connected=' + c.connected + ', joining');
  const join1: any = await new Promise((r) => c.emit('room:join', { code: '', name: 'Alice', playerId: 'alice-1' }, r));
  console.log('join ok:', join1.ok, 'token len:', join1.token?.length, 'code:', join1.snapshot?.code);
  const hijack: any = await new Promise((r) => c2.emit('room:join', { code: join1.snapshot.code, name: 'Mallory', playerId: 'alice-1' }, r));
  console.log('hijack without token → ok=' + hijack.ok, '|', hijack.error);
  const reclaim: any = await new Promise((r) => c2.emit('room:join', { code: join1.snapshot.code, name: 'Alice', playerId: 'alice-1', token: join1.token }, r));
  console.log('reclaim with token → ok=' + reclaim.ok);
  // 3) room creation cap per IP
  let created = 0, refused = 0;
  for (let i = 0; i < 15; i++) { const r: any = await new Promise((res) => c2.emit('room:join', { code: '', name: 'Spam', playerId: 'spam-' + i }, res)); r.ok ? created++ : refused++; }
  console.log(`room creates: ${created} ok, ${refused} refused (limit 10/min incl. earlier one)`);
  // 4) stats:add without key
  const add: any = await new Promise((r) => c2.emit('stats:add', { team1: [{name:'a'},{name:'b'}], team2: [{name:'c'},{name:'d'}], winner: 'team1' }, r));
  console.log('stats:add without key → ok=' + add.ok, '| code=' + add.code);
  // 5) room:leave last — it legitimately disconnects the socket server-side.
  for (const p of payloads) c2.emit('room:leave', p);
  await new Promise((r) => setTimeout(r, 300));
  console.log('room:leave fuzz → c2 connected=' + c2.connected + ' (server-initiated disconnect is expected)');
  console.log(`RESULT: uncaught=${uncaught}`);
  process.exit(uncaught ? 1 : 0);
});
