import { describe, it, expect } from 'vitest';
import { applyAction, createGame, dealHand, legalPlayIds } from '../src/server/engine/game';
import {
  cardStrength,
  effectiveSuit,
  isLeftBower,
  isRightBower,
  leftBowerSuit,
  legalPlays,
  trickWinner,
} from '../src/server/engine/rules';
import { redactState } from '../src/server/engine/redact';
import { Card, Suit } from '../src/server/engine/types';

const C = (id: string): Card => {
  const rank = id.length === 3 ? id.slice(0, 2) : id[0];
  const suit = id[id.length - 1] as Suit;
  return { id, rank: rank as any, suit };
};

describe('rules: bowers + effective suit', () => {
  it('left bower suit is same color', () => {
    expect(leftBowerSuit('H')).toBe('D');
    expect(leftBowerSuit('D')).toBe('H');
    expect(leftBowerSuit('C')).toBe('S');
    expect(leftBowerSuit('S')).toBe('C');
  });

  it('right and left bower detection', () => {
    expect(isRightBower(C('JH'), 'H')).toBe(true);
    expect(isLeftBower(C('JD'), 'H')).toBe(true);
    expect(isLeftBower(C('JH'), 'H')).toBe(false);
    expect(isRightBower(C('JD'), 'H')).toBe(false);
  });

  it("left bower's effective suit is trump", () => {
    expect(effectiveSuit(C('JD'), 'H')).toBe('H');
    expect(effectiveSuit(C('JC'), 'S')).toBe('S');
    expect(effectiveSuit(C('AD'), 'H')).toBe('D');
  });

  it('right bower beats left bower beats other trump', () => {
    const r = cardStrength(C('JH'), 'H', 'H');
    const l = cardStrength(C('JD'), 'H', 'H');
    const aT = cardStrength(C('AH'), 'H', 'H');
    expect(r).toBeGreaterThan(l);
    expect(l).toBeGreaterThan(aT);
  });
});

describe('rules: legalPlays — must follow effective suit', () => {
  it('must follow led suit when possible (non-trump lead)', () => {
    const led = C('AS');
    const hand = [C('9S'), C('KH'), C('JD')]; // JD is left bower if trump=H
    const legal = legalPlays(hand, led, 'H');
    expect(legal.map((c) => c.id).sort()).toEqual(['9S']);
  });

  it('left bower counts as trump for follow purposes', () => {
    const led = C('9H'); // led trump = H
    const hand = [C('JD'), C('AS'), C('9C')]; // JD = left bower → trump
    const legal = legalPlays(hand, led, 'H');
    expect(legal.map((c) => c.id).sort()).toEqual(['JD']);
  });

  it('if cannot follow, any card is legal', () => {
    const led = C('AS');
    const hand = [C('KH'), C('AD'), C('JD')];
    const legal = legalPlays(hand, led, 'H');
    expect(legal.length).toBe(3);
  });

  it('first to act has all cards legal', () => {
    expect(legalPlays([C('AH'), C('9S')], null, 'H').length).toBe(2);
  });
});

describe('rules: trick winner', () => {
  it('trump beats non-trump regardless of led suit', () => {
    const w = trickWinner(
      [
        { seat: 0, card: C('AS') },
        { seat: 1, card: C('9H') }, // trump
        { seat: 2, card: C('KS') },
        { seat: 3, card: C('QS') },
      ],
      'H'
    );
    expect(w).toBe(1);
  });

  it('right bower beats left bower beats other trump', () => {
    const w = trickWinner(
      [
        { seat: 0, card: C('AH') }, // led trump
        { seat: 1, card: C('JD') }, // left bower
        { seat: 2, card: C('JH') }, // right bower
        { seat: 3, card: C('9H') },
      ],
      'H'
    );
    expect(w).toBe(2);
  });

  it('led-suit highest wins when no trump played', () => {
    const w = trickWinner(
      [
        { seat: 0, card: C('9S') },
        { seat: 1, card: C('KS') },
        { seat: 2, card: C('AS') },
        { seat: 3, card: C('QS') },
      ],
      'H'
    );
    expect(w).toBe(2);
  });
});

describe('engine: bidding flow + stick the dealer', () => {
  it('round 1 all pass → BIDDING_2; dealer cannot pass round 2', () => {
    let s = createGame();
    s = dealHand({ ...s, dealer: 0 });
    // pass × 4
    let r = applyAction(s, { type: 'BID_PASS', seat: 1 });
    r = applyAction(r.state, { type: 'BID_PASS', seat: 2 });
    r = applyAction(r.state, { type: 'BID_PASS', seat: 3 });
    r = applyAction(r.state, { type: 'BID_PASS', seat: 0 });
    expect(r.state.phase).toBe('BIDDING_2');
    // BIDDING_2: passes from 1, 2, 3 ok. Dealer (0) trying to pass → error.
    r = applyAction(r.state, { type: 'BID_PASS', seat: 1 });
    r = applyAction(r.state, { type: 'BID_PASS', seat: 2 });
    r = applyAction(r.state, { type: 'BID_PASS', seat: 3 });
    expect(() =>
      applyAction(r.state, { type: 'BID_PASS', seat: 0 })
    ).toThrow(/stick the dealer/);
  });

  it('round 2 cannot call upcard suit', () => {
    let s = createGame();
    s = dealHand({ ...s, dealer: 0 });
    const upcardSuit = s.upcard!.suit;
    // pass round 1 entirely
    for (const seat of [1, 2, 3, 0] as const) {
      ({ state: s } = applyAction(s, { type: 'BID_PASS', seat }));
    }
    expect(() =>
      applyAction(s, { type: 'BID_CALL', seat: 1, suit: upcardSuit, alone: false })
    ).toThrow(/upcard/);
  });
});

describe('engine: scoring matrix', () => {
  // Helper: jam scores by manipulating trickCounts and calling internal score logic via applyAction PLAY_CARD path.
  it('makers 5 tricks, alone = 4 points', () => {
    // We construct an end-of-hand state and verify scoring. We do that by reaching the score path
    // through one PLAY_CARD that completes the 5th trick. Easier: hand-build state, then call PLAY_CARD on a final card.
    let s = createGame();
    // Construct so seat 0 (NS, alone) takes 5 tricks. Use only one fake "current trick" with one card to play.
    s = {
      ...s,
      phase: 'PLAYING',
      trump: 'H',
      maker: 0,
      alone: true,
      sittingOut: [2],
      hands: { 0: [C('AH')], 1: [], 2: [], 3: [] },
      currentTrick: { ledSuit: 'H', plays: [{ seat: 1, card: C('9H') }] },
      completedTricks: [
        { ledSuit: 'H', plays: [], winner: 0 },
        { ledSuit: 'H', plays: [], winner: 0 },
        { ledSuit: 'H', plays: [], winner: 0 },
        { ledSuit: 'H', plays: [], winner: 0 },
      ],
      trickCounts: { NS: 4, EW: 0 },
      turn: 0,
    };
    // play AH from seat 0; with sittingOut=[2], active seats = 3, so trick has 3 plays after this.
    // Add a third play to complete the trick: but we're already at 1 in plays, plus this card makes 2;
    // we need to also have seat 3 play. Adjust: pre-fill plays with seats 1 and 3.
    s = {
      ...s,
      currentTrick: {
        ledSuit: 'H',
        plays: [
          { seat: 1, card: C('9H') },
          { seat: 3, card: C('10H') },
        ],
      },
    };
    const r = applyAction(s, { type: 'PLAY_CARD', seat: 0, cardId: 'AH' });
    expect(r.state.phase === 'HAND_END' || r.state.phase === 'GAME_OVER').toBe(true);
    expect(r.state.lastHand!.pointsAwarded.NS).toBe(4);
    expect(r.state.lastHand!.march).toBe(true);
    expect(r.state.lastHand!.alone).toBe(true);
  });

  it('makers 5 tricks, not alone = 2 points', () => {
    let s = createGame();
    s = {
      ...s,
      phase: 'PLAYING',
      trump: 'H',
      maker: 0,
      alone: false,
      sittingOut: [],
      hands: { 0: [C('AH')], 1: [], 2: [], 3: [] },
      completedTricks: [
        { ledSuit: 'H', plays: [], winner: 0 },
        { ledSuit: 'H', plays: [], winner: 0 },
        { ledSuit: 'H', plays: [], winner: 0 },
        { ledSuit: 'H', plays: [], winner: 0 },
      ],
      trickCounts: { NS: 4, EW: 0 },
      currentTrick: {
        ledSuit: 'H',
        plays: [
          { seat: 1, card: C('9H') },
          { seat: 2, card: C('10H') },
          { seat: 3, card: C('QH') }, // trump, but lower than AH
        ],
      },
      turn: 0,
    };
    const r = applyAction(s, { type: 'PLAY_CARD', seat: 0, cardId: 'AH' });
    expect(r.state.lastHand!.pointsAwarded.NS).toBe(2);
    expect(r.state.lastHand!.march).toBe(true);
  });

  it('euchre: defenders get 2 points', () => {
    let s = createGame();
    s = {
      ...s,
      phase: 'PLAYING',
      trump: 'H',
      maker: 0,
      alone: false,
      sittingOut: [],
      hands: { 0: [C('AH')], 1: [], 2: [], 3: [] },
      completedTricks: [
        { ledSuit: 'H', plays: [], winner: 1 },
        { ledSuit: 'H', plays: [], winner: 1 },
        { ledSuit: 'H', plays: [], winner: 0 },
        { ledSuit: 'H', plays: [], winner: 1 },
      ],
      trickCounts: { NS: 1, EW: 3 },
      currentTrick: {
        ledSuit: 'H',
        plays: [
          { seat: 1, card: C('JH') }, // right bower - wins
          { seat: 2, card: C('10H') },
          { seat: 3, card: C('JD') },
        ],
      },
      turn: 0,
    };
    const r = applyAction(s, { type: 'PLAY_CARD', seat: 0, cardId: 'AH' });
    expect(r.state.lastHand!.euchred).toBe(true);
    expect(r.state.lastHand!.pointsAwarded.EW).toBe(2);
    expect(r.state.lastHand!.pointsAwarded.NS).toBe(0);
  });

  it('makers 3 tricks = 1 point', () => {
    let s = createGame();
    s = {
      ...s,
      phase: 'PLAYING',
      trump: 'H',
      maker: 0,
      alone: false,
      sittingOut: [],
      hands: { 0: [C('AH')], 1: [], 2: [], 3: [] },
      completedTricks: [
        { ledSuit: 'H', plays: [], winner: 0 },
        { ledSuit: 'H', plays: [], winner: 1 },
        { ledSuit: 'H', plays: [], winner: 2 },
        { ledSuit: 'H', plays: [], winner: 3 },
      ],
      trickCounts: { NS: 2, EW: 2 },
      currentTrick: {
        ledSuit: 'H',
        plays: [
          { seat: 1, card: C('9H') },
          { seat: 2, card: C('10H') },
          { seat: 3, card: C('KH') },
        ],
      },
      turn: 0,
    };
    const r = applyAction(s, { type: 'PLAY_CARD', seat: 0, cardId: 'AH' });
    expect(r.state.lastHand!.pointsAwarded.NS).toBe(1);
    expect(r.state.lastHand!.euchred).toBe(false);
    expect(r.state.lastHand!.march).toBe(false);
  });
});

describe('engine: cheat resistance via redaction', () => {
  it("spectator view hides every seat's hand", () => {
    let s = createGame();
    s = dealHand(s);
    const view = redactState(s, null);
    for (const seat of [0, 1, 2, 3] as const) {
      expect(view.seats[seat].hand).toBeUndefined();
      expect(view.seats[seat].handCount).toBe(5);
    }
    expect(view.spectator).toBe(true);
    expect(view.legalPlayIds).toEqual([]);
    // Seed and kitty must never be sent.
    expect((view as any).kitty).toBeUndefined();
    expect((view as any).seed).toBeUndefined();
  });

  it("player view shows only own hand", () => {
    let s = createGame();
    s = dealHand(s);
    const view = redactState(s, 1);
    expect(view.seats[1].hand).toBeDefined();
    expect(view.seats[0].hand).toBeUndefined();
    expect(view.seats[2].hand).toBeUndefined();
    expect(view.seats[3].hand).toBeUndefined();
  });

  it('illegal play (must follow) is rejected', () => {
    let s = createGame();
    s = dealHand(s);
    // Force a known state: trump=H, seat 1 leads with a spade, seat 2 has a spade but tries a heart.
    s = {
      ...s,
      phase: 'PLAYING',
      trump: 'H',
      maker: 1,
      hands: {
        0: [C('AS')],
        1: [C('AH')],
        2: [C('KS'), C('9H')],
        3: [C('AC')],
      },
      currentTrick: { ledSuit: 'S', plays: [{ seat: 1, card: C('AS') }] },
      turn: 2,
    };
    expect(() => applyAction(s, { type: 'PLAY_CARD', seat: 2, cardId: '9H' })).toThrow(
      /illegal/
    );
    // legalPlayIds should reflect that
    expect(legalPlayIds(s, 2)).toEqual(['KS']);
  });
});

describe('engine: dealer-discard flow', () => {
  it('order it up moves upcard into dealer hand and requires discard', () => {
    let s = createGame();
    s = dealHand({ ...s, dealer: 0 });
    const beforeDealerCount = s.hands[0].length;
    const upcard = s.upcard!;
    // seat 1 (left of dealer 0) orders it up
    const r = applyAction(s, { type: 'BID_ORDER', seat: 1, alone: false });
    expect(r.state.phase).toBe('DEALER_DISCARD');
    expect(r.state.hands[0].length).toBe(beforeDealerCount + 1);
    expect(r.state.hands[0].find((c) => c.id === upcard.id)).toBeTruthy();
    expect(r.state.trump).toBe(upcard.suit);
    // Dealer discards the upcard
    const r2 = applyAction(r.state, {
      type: 'DEALER_DISCARD',
      seat: 0,
      cardId: upcard.id,
    });
    expect(r2.state.phase).toBe('PLAYING');
    expect(r2.state.hands[0].length).toBe(5);
  });
});
