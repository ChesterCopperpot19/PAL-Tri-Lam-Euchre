/* eslint-disable no-console */
// Unit test for computeCallRanks (calls-by-rank aggregation).
//   npx tsx scripts/calls-by-rank-check.ts

import assert from 'node:assert/strict';
import type { MatchRecord, PlayerMatchStat } from '../src/lib/shared-types';
import type { HandSummary, Rank, SeatIndex } from '../src/server/engine/types';
import { computeCallRanks } from '../src/lib/stats-hands';

const p = (name: string, seat: SeatIndex, team: 'NS' | 'EW'): PlayerMatchStat => ({
  name, seat, team, isBot: false, tricks: 0, defensiveTricks: 0, defensiveEuchres: 0,
  handsCalled: 0, callsWon: 0, euchres: 0, marches: 0, loneCalled: 0, loneWon: 0,
});
const players = [p('Alice', 0, 'NS'), p('Bob', 1, 'EW'), p('Carol', 2, 'NS'), p('Dave', 3, 'EW')];
const hand = (maker: SeatIndex, bidRound: 1 | 2, upRank: Rank): HandSummary => ({
  trump: 'S', maker, alone: false, tricksByTeam: { NS: 3, EW: 2 }, tricksBySeat: { 0: 1, 1: 1, 2: 1, 3: 2 },
  pointsAwarded: { NS: 1, EW: 0 }, euchred: false, march: false, bidRound,
  upcard: { suit: 'S', rank: upRank, id: `${upRank}S` }, // present even on round 2 (turned down)
});
// Bob orders up a Jack (R1); Alice orders up an Ace (R1); Bob names a suit (R2, up-card was a 9).
const match: MatchRecord = {
  id: 'g1', ts: 1, winnerTeam: 'NS', finalScore: { NS: 10, EW: 6 }, handsPlayed: 3, players,
  hands: [hand(1, 1, 'J'), hand(0, 1, 'A'), hand(1, 2, '9')],
};

let passed = 0;
const check = (l: string, fn: () => void) => { fn(); passed++; console.log('  ✓', l); };

const cr = computeCallRanks([match]);
check('club-wide: counts by up-card rank; round-2 → R2 (ignores the turned-down card)', () => {
  assert.equal(cr.total, 3);
  assert.equal(cr.byRank.J, 1);
  assert.equal(cr.byRank.A, 1);
  assert.equal(cr.byRank.R2, 1);
  assert.equal(cr.byRank['9'], 0); // the round-2 up-card 9 is NOT counted as a "9" call
});
check('per-player: counts + % of that player\'s own calls', () => {
  const bob = cr.players.find((x) => x.name === 'Bob')!;
  assert.equal(bob.total, 2); // J (R1) + R2
  assert.equal(bob.counts.J, 1);
  assert.equal(bob.counts.R2, 1);
  assert.equal(Math.round(bob.pct.J * 100), 50);
  assert.equal(Math.round(bob.pct.R2 * 100), 50);
  const alice = cr.players.find((x) => x.name === 'Alice')!;
  assert.equal(alice.counts.A, 1);
  assert.equal(alice.pct.A, 1);
});
check('players sorted by total calls (Bob, 2, first)', () => {
  assert.equal(cr.players[0].name, 'Bob');
});

console.log(`\nAll ${passed} calls-by-rank checks passed ✅`);
