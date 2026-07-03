/* eslint-disable no-console */
// Unit tests for the new analytics: case-insensitive names, R1/R2 call success,
// loner defense, sessions, clutch/comebacks, calls-by-suit, dealer stats, luck.
//   npx tsx scripts/new-stats-check.ts

import assert from 'node:assert/strict';
import type { MatchRecord, PlayerMatchStat } from '../src/lib/shared-types';
import type { Card, HandSummary, SeatIndex, Suit, Trick } from '../src/server/engine/types';
import { computePlayers, humanGames } from '../src/lib/stats-analytics';
import { computeProfile } from '../src/lib/stats-profile';
import { computeSessions, gameDurationMs } from '../src/lib/stats-sessions';
import { computeClutch, winnerMaxDeficit } from '../src/lib/stats-clutch';
import { computeCallSuits, computeDealerStats } from '../src/lib/stats-hands';
import { computeLuck, EXPECTED_TRUMP_PER_HAND } from '../src/lib/stats-luck';

const card = (rank: Card['rank'], suit: Suit): Card => ({ rank, suit, id: `${rank}${suit}` });

function seats(names: string[]): PlayerMatchStat[] {
  return names.map((name, seat) => ({
    name,
    seat: seat as SeatIndex,
    team: (seat % 2 === 0 ? 'NS' : 'EW') as 'NS' | 'EW',
    isBot: false,
    tricks: 0,
    defensiveTricks: 0,
    handsCalled: 0,
    callsWon: 0,
    euchres: 0,
    marches: 0,
    loneCalled: 0,
    loneWon: 0,
  }));
}

function hand(partial: Partial<HandSummary> & Pick<HandSummary, 'trump' | 'maker'>): HandSummary {
  return {
    alone: false,
    tricksByTeam: { NS: 0, EW: 0 },
    tricksBySeat: { 0: 0, 1: 0, 2: 0, 3: 0 },
    pointsAwarded: { NS: 0, EW: 0 },
    euchred: false,
    march: false,
    ...partial,
  };
}

// ── Game A: NS comes back from 0–6 to win 10–7 (Alice0/Carol2 vs Bob1/Dave3) ──
const pass = (seat: SeatIndex, round: 1 | 2) => ({ seat, action: 'pass' as const, round });
const trickPlays = (cards: [SeatIndex, Card][]): Trick => ({
  ledSuit: null,
  plays: cards.map(([seat, c]) => ({ seat, card: c })),
  winner: 0,
});

const handsA: HandSummary[] = [
  // h1: Bob stuck as dealer (all 7 others passed), makes 2 in R2. EW 0→2.
  hand({
    trump: 'S', maker: 1, dealer: 1, bidRound: 2,
    pointsAwarded: { NS: 0, EW: 2 }, tricksByTeam: { NS: 1, EW: 4 },
    bids: [pass(2, 1), pass(3, 1), pass(0, 1), pass(1, 1), pass(2, 2), pass(3, 2), pass(0, 2), { seat: 1, action: 'call', round: 2, suit: 'S' }],
    tricks: [
      trickPlays([[0, card('9', 'S')], [1, card('J', 'C')], [2, card('9', 'C')], [3, card('A', 'C')]]),
      trickPlays([[0, card('10', 'S')], [1, card('A', 'S')], [2, card('10', 'C')], [3, card('K', 'C')]]),
      trickPlays([[0, card('J', 'S')], [1, card('K', 'S')], [2, card('J', 'H')], [3, card('Q', 'C')]]),
      trickPlays([[0, card('9', 'H')], [1, card('Q', 'S')], [2, card('Q', 'H')], [3, card('A', 'H')]]),
      trickPlays([[0, card('10', 'H')], [1, card('9', 'D')], [2, card('K', 'H')], [3, card('A', 'D')]]),
    ],
  }),
  // h2: Dave lone march. EW 2→6 (NS max deficit 6).
  hand({ trump: 'H', maker: 3, alone: true, march: true, pointsAwarded: { NS: 0, EW: 4 }, tricksByTeam: { NS: 0, EW: 5 } }),
  // h3: Alice R1 order-up, makes 1. 1–6.
  hand({ trump: 'S', maker: 0, bidRound: 1, upcard: card('J', 'S'), pointsAwarded: { NS: 1, EW: 0 }, tricksByTeam: { NS: 3, EW: 2 } }),
  // h4: Carol R2 march. 3–6.
  hand({ trump: 'C', maker: 2, bidRound: 2, march: true, pointsAwarded: { NS: 2, EW: 0 }, tricksByTeam: { NS: 5, EW: 0 } }),
  // h5: Bob R1 call euchred. 5–6.
  hand({ trump: 'D', maker: 1, bidRound: 1, upcard: card('A', 'D'), euchred: true, pointsAwarded: { NS: 2, EW: 0 }, tricksByTeam: { NS: 3, EW: 2 } }),
  // h6: Dave goes alone again but is STOPPED (3 tricks, 1 pt). 5–7.
  hand({ trump: 'H', maker: 3, alone: true, pointsAwarded: { NS: 0, EW: 1 }, tricksByTeam: { NS: 2, EW: 3 } }),
  // h7: Alice R1 march. 7–7.
  hand({ trump: 'S', maker: 0, bidRound: 1, upcard: card('A', 'S'), march: true, pointsAwarded: { NS: 2, EW: 0 }, tricksByTeam: { NS: 5, EW: 0 } }),
  // h8: Alice R2, makes 1. 8–7.
  hand({ trump: 'S', maker: 0, bidRound: 2, pointsAwarded: { NS: 1, EW: 0 }, tricksByTeam: { NS: 3, EW: 2 } }),
  // h9: Carol R2 march. 10–7, NS wins.
  hand({ trump: 'C', maker: 2, bidRound: 2, march: true, pointsAwarded: { NS: 2, EW: 0 }, tricksByTeam: { NS: 5, EW: 0 } }),
];

const HOUR = 3600_000;
const gameA: MatchRecord = {
  id: 'a', ts: 10 * HOUR, startedTs: 10 * HOUR - 30 * 60_000,
  winnerTeam: 'NS', finalScore: { NS: 10, EW: 7 }, handsPlayed: handsA.length,
  players: seats(['Alice', 'Bob', 'Carol', 'Dave']), hands: handsA,
};

// ── Game B: a later night (new session), lowercase names, EW wins 10–9 ──
const gameB: MatchRecord = {
  id: 'b', ts: 30 * HOUR,
  winnerTeam: 'EW', finalScore: { NS: 9, EW: 10 }, handsPlayed: 12,
  players: seats(['alice', 'BOB', 'carol', 'dave']),
};

const matches = [gameA, gameB];

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed++;
  console.log('  ✓', label);
};

// ── Case-insensitive names ──
check('names: "Alice" and "alice" merge, first-seen casing wins', () => {
  const players = computePlayers(matches);
  assert.equal(players.length, 4);
  const alice = players.find((p) => p.name === 'Alice')!;
  assert.equal(alice.games, 2);
  assert.equal(humanGames(matches).length, 2);
});

check('profile: URL casing "ALICE" resolves to canonical "Alice" with 2 games', () => {
  const prof = computeProfile('ALICE', matches);
  assert.equal(prof.exists, true);
  assert.equal(prof.name, 'Alice');
  assert.equal(prof.games, 2);
});

// ── R1/R2 call success + loner defense ──
const players = computePlayers(matches);
const P = (n: string) => players.find((p) => p.name === n)!;

check('R1/R2: Bob 0% R1 (euchred), 100% R2 (stuck make)', () => {
  assert.equal(P('Bob').r1CallPct, 0);
  assert.equal(P('Bob').r2CallPct, 1);
});
check('R1/R2: Alice 100% R1 (2/2) and 100% R2 (1/1)', () => {
  assert.equal(P('Alice').r1CallPct, 1);
  assert.equal(P('Alice').r2CallPct, 1);
});
check('loner defense: Alice faced 2 loners, stopped 1', () => {
  assert.equal(P('Alice').lonersFaced, 2);
  assert.equal(P('Alice').lonersStopped, 1);
  assert.equal(P('Dave').lonersFaced, null); // never defended a loner
});
check('recent form: Alice [W, L] chronological', () => {
  assert.deepEqual(P('Alice').recentForm, [true, false]);
});

// ── Sessions ──
check('sessions: 20h gap splits into two sessions with correct champs', () => {
  const sessions = computeSessions(matches);
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions[0].champions.sort(), ['Alice', 'Carol']);
  assert.deepEqual(sessions[1].champions.sort(), ['Bob', 'Dave']);
  assert.equal(sessions[0].handsTotal, handsA.length);
  assert.equal(sessions[0].durationMs, 30 * 60_000);
  assert.equal(sessions[0].biggestWin!.margin, 3);
});
check('game duration: 30m for game A, null without startedTs', () => {
  assert.equal(gameDurationMs(gameA), 30 * 60_000);
  assert.equal(gameDurationMs(gameB), null);
});

// ── Clutch ──
check('clutch: NS overcame a 6-point deficit (biggest comeback)', () => {
  assert.equal(winnerMaxDeficit(gameA), 6);
  const clutch = computeClutch(matches);
  assert.equal(clutch.biggestComeback!.deficit, 6);
  assert.deepEqual(clutch.biggestComeback!.names.sort(), ['Alice', 'Carol']);
  const alice = clutch.players.find((p) => p.name === 'Alice')!;
  assert.equal(alice.comebackWins, 1);
  assert.equal(alice.biggestComeback, 6);
  const bob = clutch.players.find((p) => p.name === 'Bob')!;
  assert.equal(bob.blownLeads, 1); // led by 6, lost
});
check('clutch: game B (10–9) is a close game for everyone', () => {
  const clutch = computeClutch(matches);
  const alice = clutch.players.find((p) => p.name === 'Alice')!;
  assert.equal(alice.closeGames, 1);
  assert.equal(alice.closeLosses, 1);
});

// ── Calls by suit ──
check('suits: 9 calls total — S×4, H×2, C×2, D×1; D 0% made', () => {
  const r = computeCallSuits(matches);
  assert.equal(r.total, 9);
  assert.equal(r.bySuit.S, 4);
  assert.equal(r.bySuit.H, 2);
  assert.equal(r.bySuit.C, 2);
  assert.equal(r.bySuit.D, 1);
  assert.equal(r.madeBySuit.D, 0);
  const alice = r.players.find((p) => p.name === 'Alice')!;
  assert.equal(alice.counts.S, 3);
  assert.equal(alice.makePct.S, 1);
});

// ── Dealer stats ──
check('dealer: h1 stuck dealer detected (made, +2 net)', () => {
  const d = computeDealerStats(matches);
  assert.equal(d.stuckDetectable, true);
  assert.equal(d.stuck.count, 1);
  assert.equal(d.stuck.made, 1);
  assert.equal(d.stuck.euchred, 0);
  assert.equal(d.stuck.net, 2);
  assert.equal(d.handsWithDealer, 1); // only h1 records a dealer
  assert.equal(d.dealerTeamWon, 1); // EW dealt and scored
  const bob = d.positions.find((p) => p.name === 'Bob')!;
  assert.equal(bob.hands[0], 1); // Bob was the dealer once
  assert.equal(bob.calls[0], 1); // and called from the dealer seat
});

// ── Luck ──
check('luck: trick log reconstructs dealt trump (Bob 4 incl. left bower)', () => {
  const rows = computeLuck(matches);
  const bob = rows.find((r) => r.name === 'Bob')!;
  assert.equal(bob.hands, 1);
  assert.equal(bob.trumpTotal, 4); // AS KS QS + JC (left bower)
  assert.equal(bob.lefts, 1);
  const alice = rows.find((r) => r.name === 'Alice')!;
  assert.equal(alice.trumpTotal, 3); // 9S 10S JS
  assert.equal(alice.rights, 1);
  assert.ok(Math.abs(alice.luck - (3 - EXPECTED_TRUMP_PER_HAND)) < 1e-9);
  const carol = rows.find((r) => r.name === 'Carol')!;
  assert.equal(carol.trumpTotal, 0);
});

console.log(`\nAll ${passed} new-stats checks passed ✅`);
