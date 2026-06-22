/* eslint-disable no-console */
// Unit test for the hand-level flatten + CSV (stats-hands.ts).
//   npx tsx scripts/stats-hands-check.ts

import assert from 'node:assert/strict';
import type { MatchRecord, PlayerMatchStat } from '../src/lib/shared-types';
import type { HandSummary, SeatIndex, Trick } from '../src/server/engine/types';
import { flattenHands, handsToCSV, handResultLabel } from '../src/lib/stats-hands';

const p = (name: string, seat: SeatIndex, team: 'NS' | 'EW'): PlayerMatchStat => ({
  name, seat, team, isBot: false, tricks: 0, defensiveTricks: 0, handsCalled: 0,
  callsWon: 0, euchres: 0, marches: 0, loneCalled: 0, loneWon: 0,
});
const players = [p('Alice', 0, 'NS'), p('Bob', 1, 'EW'), p('Carol', 2, 'NS'), p('Dave', 3, 'EW')];
const trick = (winner: SeatIndex): Trick => ({
  ledSuit: 'S',
  plays: [
    { seat: 1, card: { suit: 'S', rank: 'A', id: 'AS' } },
    { seat: 2, card: { suit: 'S', rank: '9', id: '9S' } },
    { seat: 3, card: { suit: 'H', rank: 'K', id: 'KH' } },
  ],
  winner,
});
const hand: HandSummary = {
  trump: 'S', maker: 1, alone: true,
  tricksByTeam: { NS: 0, EW: 5 }, tricksBySeat: { 0: 0, 1: 5, 2: 0, 3: 0 },
  pointsAwarded: { NS: 0, EW: 4 }, euchred: false, march: true,
  dealer: 0, upcard: { suit: 'S', rank: 'J', id: 'JS' }, orderedUp: true, bidRound: 1,
  bids: [{ seat: 1, action: 'order', round: 1, suit: 'S', alone: true }],
  tricks: [trick(1), trick(1), trick(1), trick(1), trick(1)],
};
const match: MatchRecord = {
  id: 'g1', ts: 1700000000000, winnerTeam: 'EW', finalScore: { NS: 6, EW: 10 }, handsPlayed: 1, players, hands: [hand],
};
// A pre-tracking game (no hands) — must be skipped by the flattener.
const old: MatchRecord = { id: 'g0', ts: 1, winnerTeam: 'NS', finalScore: { NS: 10, EW: 3 }, handsPlayed: 8, players };

let passed = 0;
const check = (l: string, fn: () => void) => { fn(); passed++; console.log('  ✓', l); };

const rows = flattenHands([match, old]);
check('flattens only matches that have a hand log (1 row)', () => assert.equal(rows.length, 1));
check('row resolves names and derives result/points/tricks', () => {
  const r = rows[0];
  assert.equal(r.maker, 'Bob');
  assert.equal(r.dealer, 'Alice');
  assert.equal(r.makerTeam, 'EW');
  assert.equal(r.trump, 'S');
  assert.equal(r.upcard, 'J♠');
  assert.equal(r.bidRound, 1);
  assert.equal(r.alone, true);
  assert.equal(r.result, 'Lone march');
  assert.equal(r.points, 4);
  assert.equal(r.pointsTeam, 'EW');
  assert.equal(r.makerTricks, 5);
  assert.equal(r.defenderTricks, 0);
});
check('result labels cover made / loner / march / euchred', () => {
  assert.equal(handResultLabel({ ...hand, alone: false, march: false }), 'Made');
  assert.equal(handResultLabel({ ...hand, alone: true, march: false }), 'Loner made');
  assert.equal(handResultLabel({ ...hand, alone: false, march: true }), 'March');
  assert.equal(handResultLabel({ ...hand, euchred: true }), 'Euchred');
});
check('CSV = header + one row, with bids and trick winners serialized', () => {
  const lines = handsToCSV(rows).split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('Date,Game ID,Hand,'));
  assert.ok(lines[1].includes('Bob'));
  assert.ok(lines[1].includes('Lone march'));
  assert.ok(lines[1].includes('order')); // bid sequence present
  assert.ok(lines[1].includes('T1:Bob')); // trick winners present
});

console.log(`\nAll ${passed} hand-data checks passed ✅`);
