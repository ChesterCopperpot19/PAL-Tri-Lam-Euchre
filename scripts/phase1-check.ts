/* eslint-disable no-console */
// Unit tests for the Phase-1 analytics (Elo, PPG, radar, profile, badges).
//   npx tsx scripts/phase1-check.ts

import assert from 'node:assert/strict';
import type { MatchRecord, PlayerMatchStat } from '../src/lib/shared-types';
import { computePlayers } from '../src/lib/stats-analytics';
import { computeElo, mostImproved } from '../src/lib/stats-elo';
import { computeRadar, computeProfile } from '../src/lib/stats-profile';
import { computeBadges } from '../src/lib/stats-achievements';

type Seat = { name: string } & Partial<PlayerMatchStat>;
function mk(id: string, ts: number, winner: 'NS' | 'EW', seats: Seat[]): MatchRecord {
  const players: PlayerMatchStat[] = seats.map((s, seat) => ({
    name: s.name,
    seat: seat as 0 | 1 | 2 | 3,
    team: (seat % 2 === 0 ? 'NS' : 'EW') as 'NS' | 'EW',
    isBot: false,
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

// Two NS wins by Alice & Carol over Bob & Dave. Maker stats set in G1 only.
const matches: MatchRecord[] = [
  mk('g1', 1000, 'NS', [
    { name: 'Alice', handsCalled: 4, callsWon: 4 },
    { name: 'Bob', handsCalled: 4, callsWon: 0 },
    { name: 'Carol', defensiveTricks: 3 },
    { name: 'Dave' },
  ]),
  mk('g2', 2000, 'NS', [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }, { name: 'Dave' }]),
];

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed++;
  console.log('  ✓', label);
};

// ── PPG ──
const players = computePlayers(matches);
const P = (n: string) => players.find((p) => p.name === n)!;
check('PPG: Alice 10 for / 6 against / +4 diff, marginStd 0', () => {
  const a = P('Alice');
  assert.equal(a.ppgFor, 10);
  assert.equal(a.ppgAgainst, 6);
  assert.equal(a.pointDiff, 4);
  assert.equal(a.marginStd, 0);
});

// ── Elo (exact) ──
const elo = computeElo(matches);
check('Elo: Alice 1538 (Δ+18), Bob 1462, both provisional', () => {
  const a = elo.get('Alice')!;
  assert.equal(a.rating, 1538);
  assert.equal(a.delta, 18);
  assert.equal(a.provisional, true);
  assert.equal(a.games, 2);
  assert.equal(a.history.length, 2);
  assert.equal(elo.get('Bob')!.rating, 1462);
});

// ── Most improved ──
check('Most improved (window 1): Alice +18', () => {
  const mi = mostImproved(elo, 1, 1)!;
  assert.equal(mi.name, 'Alice');
  assert.equal(mi.gain, 18);
});

// ── Radar (relative scaling) ──
const radar = computeRadar(players);
check('Radar: best maker → 100, worst → 20', () => {
  assert.equal(radar.get('Alice')!.scaled.maker, 100); // 4/4
  assert.equal(radar.get('Bob')!.scaled.maker, 20); // 0/4
  assert.equal(radar.get('Alice')!.raw.maker, 1);
});

// ── Profile ──
check('Profile(Alice): 2-0, partner Carol 2-0, beats Bob 2x, cum diff 8', () => {
  const prof = computeProfile('Alice', matches);
  assert.equal(prof.exists, true);
  assert.equal(prof.games, 2);
  assert.equal(prof.wins, 2);
  const carol = prof.partners.find((p) => p.name === 'Carol')!;
  assert.equal(carol.games, 2);
  assert.equal(carol.winPct, 1);
  const bob = prof.opponents.find((o) => o.name === 'Bob')!;
  assert.equal(bob.games, 2);
  assert.equal(bob.wins, 2);
  assert.deepEqual(prof.rollingForm, [true, true]);
  assert.equal(prof.trend[1].cumulativeDiff, 8);
});

// ── Badges ──
check('Badges: First Blood held by winners, not losers', () => {
  const badges = computeBadges(players, elo);
  const firstWin = badges.find((b) => b.id === 'first-win')!;
  assert.ok(firstWin.holders.includes('Alice'));
  assert.ok(firstWin.holders.includes('Carol'));
  assert.ok(!firstWin.holders.includes('Bob'));
});

console.log(`\nAll ${passed} Phase-1 analytics checks passed ✅`);
