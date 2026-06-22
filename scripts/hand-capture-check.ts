/* eslint-disable no-console */
// Verifies the hand-level capture: bot-drive a full game through the engine and
// assert every hand recorded trump/up-card/dealer/bid-round/bids/tricks.
//   npx tsx scripts/hand-capture-check.ts

import assert from 'node:assert/strict';
import { applyAction, createGame } from '../src/server/engine/game';
import { chooseBotAction } from '../src/server/engine/bot';
import type { GameState, SeatIndex } from '../src/server/engine/types';

let state: GameState = createGame();
state = applyAction(state, { type: 'START_HAND' }).state;

let guard = 0;
while (state.phase !== 'GAME_OVER' && guard++ < 5000) {
  if (state.phase === 'HAND_END') {
    state = applyAction(state, { type: 'START_HAND' }).state;
    continue;
  }
  const action = chooseBotAction(state, state.turn as SeatIndex);
  state = applyAction(state, action).state;
}

assert.equal(state.phase, 'GAME_OVER', 'game ran to completion');
assert.ok(state.history.length >= 1, 'recorded at least one hand');

let passed = 0;
const check = (label: string, fn: () => void) => { fn(); passed++; console.log('  ✓', label); };

check(`every hand captured dealer, up-card key, bid round & ordered-up`, () => {
  for (const h of state.history) {
    assert.equal(typeof h.dealer, 'number');
    assert.ok('upcard' in h);
    assert.ok(h.bidRound === 1 || h.bidRound === 2);
    assert.equal(typeof h.orderedUp, 'boolean');
    assert.equal(h.orderedUp, h.bidRound === 1); // orderedUp == round 1
  }
});

check(`every hand has a bid log with exactly one order/call, by the maker`, () => {
  for (const h of state.history) {
    assert.ok(Array.isArray(h.bids) && h.bids.length >= 1, 'non-empty bids');
    const decisive = h.bids.filter((b) => b.action !== 'pass');
    assert.equal(decisive.length, 1, 'exactly one decisive bid');
    assert.equal(decisive[0].seat, h.maker, 'decisive bid by the maker');
    assert.equal(decisive[0].action, h.orderedUp ? 'order' : 'call');
  }
});

check(`every hand has 5 completed tricks, each with a winner`, () => {
  for (const h of state.history) {
    assert.equal(h.tricks?.length, 5);
    for (const t of h.tricks!) {
      assert.equal(typeof t.winner, 'number');
      assert.ok(t.plays.length === 3 || t.plays.length === 4); // 4, or 3 when alone
    }
  }
});

check(`bids reset per hand (no run-away accumulation)`, () => {
  for (const h of state.history) assert.ok(h.bids!.length <= 8, 'at most 8 bid actions');
});

console.log(`\nAll ${passed} hand-capture checks passed ✅ (${state.history.length} hands)`);
