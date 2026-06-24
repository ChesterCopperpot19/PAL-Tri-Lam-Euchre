/* eslint-disable no-console */
// Unit test for the farmer's-hand rule (full re-deal variant).
//   npx tsx scripts/farmers-hand-check.ts

import assert from 'node:assert/strict';
import { applyAction, createGame, isFarmersHand } from '../src/server/engine/game';
import type { Card, GameState, Rank, Suit } from '../src/server/engine/types';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit, id: `${rank}${suit}` });
const farmer: Card[] = [card('9', 'H'), card('10', 'H'), card('9', 'D'), card('10', 'D'), card('9', 'C')];
const other: Card[] = [card('A', 'H'), card('K', 'H'), card('Q', 'H'), card('J', 'H'), card('9', 'S')];

let passed = 0;
const check = (l: string, fn: () => void) => { fn(); passed++; console.log('  ✓', l); };

check('isFarmersHand: all 9s/10s = true; any higher card = false; needs 5', () => {
  assert.equal(isFarmersHand(farmer), true);
  assert.equal(isFarmersHand(other), false);
  assert.equal(isFarmersHand(farmer.slice(0, 4)), false);
});

const base: GameState = {
  ...createGame(),
  phase: 'BIDDING_1',
  dealer: 0,
  turn: 1,
  hands: { 0: other, 1: farmer, 2: other, 3: other },
  kitty: [card('A', 'S'), card('J', 'S'), card('Q', 'S'), card('K', 'S')],
  upcard: card('A', 'S'),
};

const { state: after } = applyAction(base, { type: 'FARMERS_REDEAL', seat: 1 });
check('re-deal gives a fresh round-1 hand with the SAME dealer', () => {
  assert.equal(after.phase, 'BIDDING_1');
  assert.equal(after.dealer, 0); // dealer unchanged
  assert.equal(after.turn, 1); // next(dealer)
  for (const s of [0, 1, 2, 3] as const) assert.equal(after.hands[s].length, 5);
  assert.equal(after.kitty.length, 4);
  assert.ok(after.upcard);
});
check('the deal actually changes (fresh shuffle of the full deck)', () => {
  assert.notDeepEqual(after.hands[1].map((c) => c.id), farmer.map((c) => c.id));
  const all = [0, 1, 2, 3].flatMap((s) => after.hands[s as 0 | 1 | 2 | 3]).concat(after.kitty);
  assert.equal(new Set(all.map((c) => c.id)).size, 24); // every card distinct, full deck
});
check('rejects re-deal when not a farmer hand, or not during bidding', () => {
  assert.throws(() => applyAction({ ...base, hands: { ...base.hands, 1: other } }, { type: 'FARMERS_REDEAL', seat: 1 }), /not a farmer/);
  assert.throws(() => applyAction({ ...base, phase: 'PLAYING' }, { type: 'FARMERS_REDEAL', seat: 1 }), /only during bidding/);
});

console.log(`\nAll ${passed} farmer's-hand (re-deal) checks passed ✅`);
