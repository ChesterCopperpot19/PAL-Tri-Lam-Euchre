/* eslint-disable no-console */
// Unit test for the farmer's-hand rule (engine).
//   npx tsx scripts/farmers-hand-check.ts

import assert from 'node:assert/strict';
import { applyAction, createGame, isFarmersHand } from '../src/server/engine/game';
import type { Card, GameState, Rank, Suit } from '../src/server/engine/types';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit, id: `${rank}${suit}` });
const farmer: Card[] = [card('9', 'H'), card('10', 'H'), card('9', 'D'), card('10', 'D'), card('9', 'C')];
const other: Card[] = [card('A', 'H'), card('K', 'H'), card('Q', 'H'), card('J', 'H'), card('9', 'S')];
const buried: Card[] = [card('J', 'S'), card('Q', 'S'), card('K', 'S')];
const upcard = card('A', 'S');

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
  kitty: [upcard, ...buried],
  upcard,
  farmersSwapped: [],
};

const { state: after } = applyAction(base, { type: 'FARMERS_SWAP', seat: 1, cardIds: ['9H', '10H', '9D'] });
check('swap replaces the 3 chosen cards with the 3 buried kitty cards', () => {
  assert.deepEqual(after.hands[1].map((c) => c.id).sort(), ['10D', '9C', 'JS', 'KS', 'QS'].sort());
});
check('up-card stays on top; the given cards move under it in the kitty', () => {
  assert.equal(after.kitty[0].id, 'AS');
  assert.deepEqual(after.kitty.slice(1).map((c) => c.id).sort(), ['9D', '9H', '10H'].sort());
});
check('turn & phase unchanged; seat marked as swapped', () => {
  assert.equal(after.turn, 1);
  assert.equal(after.phase, 'BIDDING_1');
  assert.deepEqual(after.farmersSwapped, [1]);
});
check("the new hand is no longer a farmer's hand", () => {
  assert.equal(isFarmersHand(after.hands[1]), false);
});
check('rejects: second swap, wrong count, wrong turn, non-farmer hand', () => {
  assert.throws(() => applyAction(after, { type: 'FARMERS_SWAP', seat: 1, cardIds: after.hands[1].slice(0, 3).map((c) => c.id) }), /already swapped/);
  assert.throws(() => applyAction(base, { type: 'FARMERS_SWAP', seat: 1, cardIds: ['9H', '10H'] }), /exactly 3/);
  assert.throws(() => applyAction(base, { type: 'FARMERS_SWAP', seat: 0, cardIds: ['AH', 'KH', 'QH'] }), /not your turn/);
  assert.throws(() => applyAction({ ...base, hands: { ...base.hands, 1: other } }, { type: 'FARMERS_SWAP', seat: 1, cardIds: ['AH', 'KH', 'QH'] }), /not a farmer/);
});

console.log(`\nAll ${passed} farmer's-hand checks passed ✅`);
