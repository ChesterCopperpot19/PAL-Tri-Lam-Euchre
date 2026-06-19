/* eslint-disable no-console */
// Standalone unit test for the stats-analytics module. Run with:
//   npx tsx scripts/stats-analytics-check.ts
// Uses hand-computed synthetic games so every expected value is verifiable by eye.
// (We avoid vitest here because esbuild's service mode is flaky on Node 25.)

import assert from 'node:assert/strict';
import type { MatchRecord, PlayerMatchStat } from '../src/lib/shared-types';
import {
  humanGames,
  computePlayers,
  computeDuos,
  computeHeadToHead,
  computeSuperlatives,
  sortPlayers,
} from '../src/lib/stats-analytics';

type SeatSpec = { name: string; isBot?: boolean } & Partial<PlayerMatchStat>;

/** Build a MatchRecord. seats[0,2] = NS, seats[1,3] = EW. */
function mk(id: string, ts: number, winner: 'NS' | 'EW', seats: SeatSpec[]): MatchRecord {
  const players: PlayerMatchStat[] = seats.map((s, seat) => ({
    name: s.name,
    seat: seat as 0 | 1 | 2 | 3,
    team: (seat % 2 === 0 ? 'NS' : 'EW') as 'NS' | 'EW',
    isBot: s.isBot ?? false,
    tricks: s.tricks ?? 0,
    defensiveTricks: s.defensiveTricks ?? 0,
    handsCalled: s.handsCalled ?? 0,
    callsWon: s.callsWon ?? 0,
    euchres: s.euchres ?? 0,
    marches: s.marches ?? 0,
    loneCalled: s.loneCalled ?? 0,
    loneWon: s.loneWon ?? 0,
  }));
  return {
    id,
    ts,
    winnerTeam: winner,
    finalScore: winner === 'NS' ? { NS: 10, EW: 6 } : { NS: 6, EW: 10 },
    handsPlayed: 8,
    players,
  };
}

const A = (extra: Partial<SeatSpec> = {}): SeatSpec => ({ name: 'Alice', handsCalled: 2, callsWon: 2, ...extra });
const matches: MatchRecord[] = [
  // G1 NS win:  NS = Alice,Carol | EW = Bob,Dave
  mk('g1', 1, 'NS', [A(), { name: 'Bob', loneCalled: 1 }, { name: 'Carol' }, { name: 'Dave' }]),
  // G2 EW win:  NS = Alice,Bob   | EW = Carol,Dave
  mk('g2', 2, 'EW', [A(), { name: 'Carol' }, { name: 'Bob' }, { name: 'Dave' }]),
  // G3 NS win:  NS = Alice,Dave  | EW = Bob,Carol
  mk('g3', 3, 'NS', [A(), { name: 'Bob' }, { name: 'Dave', marches: 1 }, { name: 'Carol' }]),
  // G4 EW win:  NS = Alice,Carol | EW = Bob,Dave  (repeat of G1's pairs, flipped result)
  mk('g4', 4, 'EW', [A(), { name: 'Bob' }, { name: 'Carol' }, { name: 'Dave' }]),
  // G5 has a BOT — must be ignored everywhere.
  mk('g5', 5, 'NS', [A(), { name: 'Bob' }, { name: 'Maggie', isBot: true }, { name: 'Dave' }]),
];

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed++;
  console.log('  ✓', label);
};

// ── Filtering ──
check('humanGames drops the bot game (5 → 4)', () => {
  assert.equal(humanGames(matches).length, 4);
});

// ── Individual rows ──
const players = computePlayers(matches);
const byName = new Map(players.map((p) => [p.name, p]));
const P = (n: string) => byName.get(n)!;

check('Alice: 4 GP, 2-2, 50%, current -1, calls 100%', () => {
  const a = P('Alice');
  assert.equal(a.games, 4);
  assert.equal(a.wins, 2);
  assert.equal(a.losses, 2);
  assert.equal(a.winPct, 0.5);
  assert.equal(a.currentStreak, -1);
  assert.equal(a.handsCalled, 8);
  assert.equal(a.callsWon, 8);
  assert.equal(a.callPct, 1);
});
check('Bob: 1-3, 25%, current +1, longest loss streak 3', () => {
  const b = P('Bob');
  assert.equal(b.wins, 1);
  assert.equal(b.losses, 3);
  assert.equal(b.winPct, 0.25);
  assert.equal(b.currentStreak, 1);
  assert.equal(b.longestLossStreak, 3);
});
check('Carol: current -2, longest win streak 2', () => {
  const c = P('Carol');
  assert.equal(c.currentStreak, -2);
  assert.equal(c.longestWinStreak, 2);
  assert.equal(c.longestLossStreak, 2);
});
check('Dave: 3-1, 75%, current +3, longest win streak 3, 1 march', () => {
  const d = P('Dave');
  assert.equal(d.wins, 3);
  assert.equal(d.winPct, 0.75);
  assert.equal(d.currentStreak, 3);
  assert.equal(d.longestWinStreak, 3);
  assert.equal(d.marches, 1);
});

// ── Duos ──
const duos = computeDuos(matches);
const duo = (k: string) => duos.find((d) => d.key === k);
check('6 distinct duos; Alice&Carol and Bob&Dave each have 2 games', () => {
  assert.equal(duos.length, 6);
  assert.equal(duo('Alice|Carol')!.games, 2);
  assert.equal(duo('Alice|Carol')!.wins, 1); // G1 win, G4 loss
  assert.equal(duo('Bob|Dave')!.games, 2);
  assert.equal(duo('Bob|Dave')!.wins, 1);
  assert.equal(duo('Alice|Dave')!.games, 1);
});

// ── Head-to-head ──
const h2h = computeHeadToHead(matches);
check('Alice vs Bob: 3 meetings, Alice 2 – Bob 1', () => {
  const r = h2h.find((x) => x.key === 'Alice|Bob')!;
  assert.equal(r.games, 3); // opposed in G1, G3, G4 (partners in G2 → excluded)
  assert.equal(r.aWins, 2); // a = Alice
  assert.equal(r.bWins, 1);
});

// ── Superlatives ──
const sup = computeSuperlatives(players, 3);
const award = (id: string) => sup.find((s) => s.id === id)!;
check('Superlatives: Anchor=Dave, Hot=Dave(3W), Due=Carol(2L), Sharp=Alice, Gambler=Bob, Sweeper=Dave', () => {
  assert.equal(award('anchor').player, 'Dave');
  assert.equal(award('anchor').value, '75%');
  assert.equal(award('hot').player, 'Dave');
  assert.equal(award('hot').value, '3W');
  assert.equal(award('cold').player, 'Carol');
  assert.equal(award('cold').value, '2L');
  assert.equal(award('sharp').player, 'Alice');
  assert.equal(award('sharp').value, '100%');
  assert.equal(award('gambler').player, 'Bob');
  assert.equal(award('sweeper').player, 'Dave');
});

// ── Sorting ──
check('sortPlayers by winPct desc → Dave first; by name asc → Alice first', () => {
  assert.equal(sortPlayers(players, 'winPct', 'desc')[0].name, 'Dave');
  assert.equal(sortPlayers(players, 'name', 'asc')[0].name, 'Alice');
});

// ── Empty input doesn't throw ──
check('empty input is safe', () => {
  assert.deepEqual(computePlayers([]), []);
  assert.deepEqual(computeDuos([]), []);
  assert.deepEqual(computeHeadToHead([]), []);
  assert.equal(computeSuperlatives([], 5).every((s) => s.player === null), true);
});

console.log(`\nAll ${passed} checks passed ✅`);
