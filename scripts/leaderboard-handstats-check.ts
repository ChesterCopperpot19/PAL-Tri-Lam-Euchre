/* eslint-disable no-console */
// Unit test for the hand-level leaderboard stats (computePlayers + sortPlayers).
//   npx tsx scripts/leaderboard-handstats-check.ts

import assert from 'node:assert/strict';
import type { MatchRecord, PlayerMatchStat } from '../src/lib/shared-types';
import type { HandSummary, SeatIndex } from '../src/server/engine/types';
import { computePlayers, sortPlayers } from '../src/lib/stats-analytics';

const ps = (name: string, seat: SeatIndex, team: 'NS' | 'EW', x: Partial<PlayerMatchStat>): PlayerMatchStat => ({
  name, seat, team, isBot: false, tricks: 0, defensiveTricks: 0, defensiveEuchres: 0,
  handsCalled: 0, callsWon: 0, euchres: 0, marches: 0, loneCalled: 0, loneWon: 0, ...x,
});
const players = [
  ps('Alice', 0, 'NS', { handsCalled: 2, callsWon: 2, marches: 1, loneCalled: 1, loneWon: 1, defensiveEuchres: 1 }),
  ps('Bob', 1, 'EW', { handsCalled: 1, callsWon: 0, euchres: 1 }),
  ps('Carol', 2, 'NS', { defensiveEuchres: 1 }),
  ps('Dave', 3, 'EW', {}),
];
const hand = (
  maker: SeatIndex, bidRound: 1 | 2, euchred: boolean, march: boolean, alone: boolean,
  pts: { NS: number; EW: number },
): HandSummary => ({
  trump: 'H', maker, alone, tricksByTeam: { NS: 3, EW: 2 }, tricksBySeat: { 0: 2, 1: 1, 2: 1, 3: 1 },
  pointsAwarded: pts, euchred, march, bidRound,
});
const match: MatchRecord = {
  id: 'g1', ts: 1, winnerTeam: 'NS', finalScore: { NS: 7, EW: 0 }, handsPlayed: 3, players,
  hands: [
    hand(0, 1, false, false, false, { NS: 1, EW: 0 }), // Alice orders up R1, made +1
    hand(1, 2, true, false, false, { NS: 2, EW: 0 }), // Bob names R2, euchred (defenders NS +2)
    hand(0, 1, false, true, true, { NS: 4, EW: 0 }), // Alice lone march R1, +4
  ],
};

const rows = computePlayers([match]);
const by = (n: string) => rows.find((r) => r.name.toLowerCase() === n.toLowerCase())!;
const round = (v: number | null, d = 4) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

let passed = 0;
const check = (l: string, fn: () => void) => { fn(); passed++; console.log('  ✓', l); };

check('Alice: bid 2/3, all orders, net +2.5/call, def-euchre 100%, alone 100%', () => {
  const a = by('Alice');
  assert.equal(round(a.bidPct), round(2 / 3));
  assert.equal(a.orderPct, 1);
  assert.equal(a.netPtsPerCall, 2.5); // (1 + 4) / 2
  assert.equal(a.defEuchreRate, 1); // euchred Bob on her 1 defensive hand
  assert.equal(a.aloneMakePct, 1);
});
check('Bob: round-2 caller, net −2/call (got euchred), no loners → null', () => {
  const b = by('Bob');
  assert.equal(round(b.bidPct), round(1 / 3));
  assert.equal(b.orderPct, 0);
  assert.equal(b.netPtsPerCall, -2);
  assert.equal(b.defEuchreRate, 0); // defended 2 hands, no euchres
  assert.equal(b.aloneMakePct, null);
});
check('Non-callers: logged-call rates null, but defense rate real', () => {
  const c = by('Carol');
  assert.equal(c.orderPct, null);
  assert.equal(c.netPtsPerCall, null);
  assert.equal(c.bidPct, 0);
  assert.equal(c.defEuchreRate, 1); // helped euchre Bob
  const d = by('Dave');
  assert.equal(d.netPtsPerCall, null);
  assert.equal(d.defEuchreRate, 0);
});
check('sortPlayers pushes null metrics to the bottom (desc)', () => {
  const sorted = sortPlayers(rows, 'netPtsPerCall', 'desc');
  assert.equal(sorted[0].name.toLowerCase(), 'alice'); // +2.5 leads
  assert.equal(sorted[sorted.length - 1].netPtsPerCall, null); // null last
});

console.log(`\nAll ${passed} leaderboard hand-stat checks passed ✅`);
