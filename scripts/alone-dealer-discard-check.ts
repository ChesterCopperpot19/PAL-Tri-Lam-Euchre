/* eslint-disable no-console */
// Regression test for the go-alone freeze bug. When the alone-caller's partner is
// the DEALER, that dealer both sits out AND must complete the mandatory discard.
// The scheduler used to skip any sitting-out turn-seat, which froze the hand here.
// This proves the engine/bot can always drive the sitting-out dealer's discard, so
// the fix is purely the scheduler gate (skip sitting-out seats only during PLAYING).
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
// partner who sits out IS the dealer (seat 0) — who still owes a discard.
const base: GameState = {
  ...createGame(),
  phase: 'BIDDING_1',
  dealer: 0,
  turn: 2,
  hands: { 0: hand('H'), 1: hand('D'), 2: hand('C'), 3: hand('S') },
  upcard: card('A', 'S'),
};

const { state: ordered } = applyAction(base, { type: 'BID_ORDER', seat: 2, alone: true });

check('alone order by the dealer’s partner → dealer sits out but owes a discard', () => {
  assert.equal(ordered.phase, 'DEALER_DISCARD');
  assert.equal(ordered.turn, 0); // turn is on the dealer
  assert.ok(ordered.sittingOut.includes(0)); // and the dealer is the sitting-out seat
  assert.equal(ordered.hands[0].length, 6); // picked up the upcard, not yet discarded
});

check('the sitting-out dealer can still be driven to a valid discard (no freeze)', () => {
  const action = chooseBotAction(ordered, 0);
  assert.equal(action.type, 'DEALER_DISCARD');
  const { state: playing } = applyAction(ordered, action);
  assert.equal(playing.phase, 'PLAYING'); // hand advances into play
  assert.equal(playing.hands[0].length, 5); // discarded back down to five
  assert.ok(!playing.sittingOut.includes(playing.turn)); // play never lands on the sitting-out seat
});

console.log(`\nAll ${passed} alone-dealer-discard checks passed ✅`);
