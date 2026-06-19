/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// Unit test for the manual (in-person) match builder + validator. Run with:
//   npx tsx scripts/manual-match-check.ts

import assert from 'node:assert/strict';
import { validateManualInput, buildManualMatch } from '../src/lib/manual-match';
import {
  humanGames,
  computeDuos,
  computeHeadToHead,
  computePlayers,
} from '../src/lib/stats-analytics';
import type { ManualMatchInput } from '../src/lib/shared-types';

const good: ManualMatchInput = {
  team1: [{ name: 'Alice' }, { name: 'Carol', tricks: 12, marches: 1 }],
  team2: [{ name: 'Bob' }, { name: 'Dave' }],
  winner: 'team1',
};

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed++;
  console.log('  ✓', label);
};

// ── Validation ──
check('valid input passes', () => assert.equal(validateManualInput(good), null));
check('rejects a missing name', () =>
  assert.match(validateManualInput({ ...good, team1: [{ name: '' }, { name: 'Carol' }] })!, /required/));
check('rejects duplicate names', () =>
  assert.match(validateManualInput({ ...good, team2: [{ name: 'Alice' }, { name: 'Dave' }] })!, /different/));
check('rejects no winner', () =>
  assert.match(validateManualInput({ ...good, winner: undefined as any })!, /won/));
check('rejects wrong team size', () =>
  assert.match(validateManualInput({ ...good, team1: [{ name: 'A' }] as any })!, /two players/));
check('rejects a negative score', () =>
  assert.match(validateManualInput({ ...good, finalScore: { team1: -1, team2: 0 } })!, /0 or more/));

// ── Build ──
const rec = buildManualMatch(good, 'manual-x', 1234);
check('build: id/ts/source set, all four are human', () => {
  assert.equal(rec.id, 'manual-x');
  assert.equal(rec.ts, 1234);
  assert.equal(rec.source, 'manual');
  assert.equal(rec.players.length, 4);
  assert.equal(rec.players.every((p) => p.isBot === false), true);
});
check('build: team1 → seats 0,2 (NS); team2 → seats 1,3 (EW)', () => {
  const bySeat = new Map(rec.players.map((p) => [p.seat, p]));
  assert.equal(bySeat.get(0)!.name, 'Alice');
  assert.equal(bySeat.get(0)!.team, 'NS');
  assert.equal(bySeat.get(2)!.name, 'Carol');
  assert.equal(bySeat.get(2)!.team, 'NS');
  assert.equal(bySeat.get(1)!.name, 'Bob');
  assert.equal(bySeat.get(1)!.team, 'EW');
  assert.equal(bySeat.get(3)!.name, 'Dave');
  assert.equal(bySeat.get(3)!.team, 'EW');
});
check('build: winner team1 → NS, default score 10–0, optional stats kept/zeroed', () => {
  assert.equal(rec.winnerTeam, 'NS');
  assert.deepEqual(rec.finalScore, { NS: 10, EW: 0 });
  const carol = rec.players.find((p) => p.name === 'Carol')!;
  assert.equal(carol.tricks, 12);
  assert.equal(carol.marches, 1);
  assert.equal(carol.handsCalled, 0); // unspecified → 0
});
check('build: explicit score + team2 win → EW', () => {
  const r = buildManualMatch({ ...good, winner: 'team2', finalScore: { team1: 8, team2: 10 } }, 'y', 1);
  assert.equal(r.winnerTeam, 'EW');
  assert.deepEqual(r.finalScore, { NS: 8, EW: 10 });
});

// ── Integration with the analytics ──
check('analytics: counts as human game; Alice&Carol partner; Alice beat Bob', () => {
  const ms = [rec];
  assert.equal(humanGames(ms).length, 1);
  assert.ok(computeDuos(ms).find((d) => d.key === 'Alice|Carol' && d.wins === 1));
  const ab = computeHeadToHead(ms).find((d) => d.key === 'Alice|Bob')!;
  assert.equal(ab.aWins, 1);
  assert.equal(ab.bWins, 0);
  const players = computePlayers(ms);
  assert.equal(players.find((p) => p.name === 'Alice')!.wins, 1);
  assert.equal(players.find((p) => p.name === 'Bob')!.losses, 1);
});

console.log(`\nAll ${passed} manual-match checks passed ✅`);
