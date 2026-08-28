/* eslint-disable no-console */
// Regression test for the sitting-out dealer's discard. When the alone-caller's
// partner is the DEALER, that dealer sits out and never plays a card, so the
// mandatory discard decides nothing. The engine skips it and goes straight to
// PLAYING, burying the upcard, rather than stalling the table on a dead prompt.
// (It previously required that discard, which is what this script used to pin.)
// The complementary case — any other order-up still owes a real discard — is
// asserted below so the skip stays narrowly scoped.
//   npx tsx scripts/alone-dealer-discard-check.ts

import assert from 'node:assert/strict';
import { applyAction, createGame } from '../src/server/engine/game';
import { chooseBotAction } from '../src/server/engine/bot';
import type { Card, GameState, Rank, Suit } from '../src/server/engine/types';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit, id: `${rank}${suit}` });
const hand = (suit: Suit): Card[] =>
  (['9', '10', 'J', 'Q', 'K'] as Rank[]).map((r) => card(r, suit));

let passed = 0;
const check = (l: string, fn: () => void) => { fn(); passed++; console.log('  ✓', l); };

// Dealer = seat 0. Seat 2 is the dealer's partner; seat 2 orders up ALONE, so the
// partner who sits out IS the dealer (seat 0).
const base: GameState = {
  ...createGame(),
  phase: 'BIDDING_1',
  dealer: 0,
  turn: 2,
  hands: { 0: hand('H'), 1: hand('D'), 2: hand('C'), 3: hand('S') },
  upcard: card('A', 'S'),
};

const { state: ordered } = applyAction(base, { type: 'BID_ORDER', seat: 2, alone: true });

check('alone order by the dealer’s partner → no discard, straight into play', () => {
  assert.equal(ordered.phase, 'PLAYING'); // skipped DEALER_DISCARD entirely
  assert.ok(ordered.sittingOut.includes(0)); // the dealer is the sitting-out seat
  assert.equal(ordered.turn, 1); // lead passes to the dealer's left
  assert.ok(!ordered.sittingOut.includes(ordered.turn)); // never lands on the sitting-out seat
});

check('the upcard is buried — the sitting-out dealer keeps their dealt five', () => {
  assert.equal(ordered.hands[0].length, 5);
  assert.ok(!ordered.hands[0].some((c) => c.id === 'AS')); // upcard never entered the hand
  assert.equal(ordered.upcardTaken, true); // still an order-up for scoring/stats
  assert.equal(ordered.trump, 'S');
});

check('play proceeds with three active seats and no freeze', () => {
  const action = chooseBotAction(ordered, 1);
  assert.equal(action.type, 'PLAY_CARD'); // bot plays, rather than owing a discard
  const { state: afterLead } = applyAction(ordered, action);
  assert.ok(!afterLead.sittingOut.includes(afterLead.turn));
  assert.equal(afterLead.hands[0].length, 5); // dealer's hand is never touched
});

// Complementary case: dealer sits out ONLY when the loner is their partner.
// Seat 1 (an opponent) orders up alone — the dealer plays on, so the discard stands.
const { state: opponentAlone } = applyAction(
  { ...base, turn: 1 },
  { type: 'BID_ORDER', seat: 1, alone: true }
);

check('alone order by an opponent → dealer still plays, so the discard is required', () => {
  assert.equal(opponentAlone.phase, 'DEALER_DISCARD');
  assert.equal(opponentAlone.turn, 0); // turn parked on the dealer
  assert.ok(!opponentAlone.sittingOut.includes(0)); // dealer is NOT sitting out
  assert.ok(opponentAlone.sittingOut.includes(3)); // seat 1's partner sits out
  assert.equal(opponentAlone.hands[0].length, 6); // picked up, not yet discarded
});

check('a plain (not alone) order-up still requires the discard', () => {
  const { state: plain } = applyAction(base, { type: 'BID_ORDER', seat: 2, alone: false });
  assert.equal(plain.phase, 'DEALER_DISCARD');
  assert.equal(plain.turn, 0);
  assert.deepEqual(plain.sittingOut, []);
  assert.equal(plain.hands[0].length, 6);
});

console.log(`\nAll ${passed} alone-dealer-discard checks passed ✅`);
