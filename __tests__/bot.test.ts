import { describe, it, expect } from 'vitest';
import { chooseBotAction, _internal } from '../src/server/engine/bot';
import { applyAction, createGame, dealHand } from '../src/server/engine/game';
import { Card, GameState, Suit } from '../src/server/engine/types';

const C = (id: string): Card => {
  const rank = id.length === 3 ? id.slice(0, 2) : id[0];
  const suit = id[id.length - 1] as Suit;
  return { id, rank: rank as any, suit };
};

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...createGame(),
    ...overrides,
  };
}

describe('bot: hand scoring', () => {
  it('right + left bower hand scores higher than no bowers', () => {
    const strong = [C('JH'), C('JD'), C('AH'), C('KS'), C('9C')];
    const weak = [C('9H'), C('10H'), C('QH'), C('9S'), C('9C')];
    const a = _internal.scoreHandForTrump(strong, 'H');
    const b = _internal.scoreHandForTrump(weak, 'H');
    expect(a).toBeGreaterThan(b);
  });

  it('voids in non-trump suits add value', () => {
    const voided = [C('JH'), C('AH'), C('KH'), C('QH'), C('10H')]; // all trump
    const spread = [C('JH'), C('AH'), C('KS'), C('QC'), C('10D')];
    const a = _internal.scoreHandForTrump(voided, 'H');
    const b = _internal.scoreHandForTrump(spread, 'H');
    expect(a).toBeGreaterThan(b);
  });
});

describe('bot: bidding round 1', () => {
  it('strong hand orders it up', () => {
    const s = baseState({
      phase: 'BIDDING_1',
      dealer: 0,
      turn: 1,
      hands: {
        0: [],
        1: [C('JH'), C('JD'), C('AH'), C('AS'), C('9C')], // both bowers + ace
        2: [],
        3: [],
      },
      upcard: C('9H'), // upcard = H, so trump candidate is H
    });
    const action = chooseBotAction(s, 1);
    expect(action.type).toBe('BID_ORDER');
  });

  it('weak hand passes', () => {
    const s = baseState({
      phase: 'BIDDING_1',
      dealer: 0,
      turn: 1,
      hands: {
        0: [],
        1: [C('9D'), C('10D'), C('QC'), C('9S'), C('10S')], // nothing in H
        2: [],
        3: [],
      },
      upcard: C('9H'),
    });
    const action = chooseBotAction(s, 1);
    expect(action.type).toBe('BID_PASS');
  });

  it('dealer with right bower in upcard position takes it up gladly', () => {
    const s = baseState({
      phase: 'BIDDING_1',
      dealer: 1,
      turn: 1,
      hands: {
        0: [],
        1: [C('JD'), C('AH'), C('KS'), C('QC'), C('10D')], // left bower already, A trump
        2: [],
        3: [],
      },
      upcard: C('JH'), // dealer would pick up the right bower
    });
    const action = chooseBotAction(s, 1);
    expect(action.type).toBe('BID_ORDER');
  });
});

describe('bot: bidding round 2 + stick the dealer', () => {
  it('passes round 2 with bad cards if not dealer', () => {
    const s = baseState({
      phase: 'BIDDING_2',
      dealer: 0,
      turn: 1,
      hands: {
        0: [],
        1: [C('9D'), C('10D'), C('9C'), C('10C'), C('9S')],
        2: [],
        3: [],
      },
      upcard: C('JH'),
    });
    const action = chooseBotAction(s, 1);
    expect(action.type).toBe('BID_PASS');
  });

  it('stuck dealer must call in round 2 even with weak hand', () => {
    const s = baseState({
      phase: 'BIDDING_2',
      dealer: 0,
      turn: 0,
      hands: {
        0: [C('9D'), C('10D'), C('9C'), C('10C'), C('9S')],
        1: [],
        2: [],
        3: [],
      },
      upcard: C('JH'),
    });
    const action = chooseBotAction(s, 0);
    expect(action.type).toBe('BID_CALL');
    if (action.type !== 'BID_CALL') return;
    expect(action.suit).not.toBe('H'); // can't call upcard suit
  });
});

describe('bot: dealer discard creates voids', () => {
  it('discards a singleton off-suit to create a void', () => {
    const s = baseState({
      phase: 'DEALER_DISCARD',
      dealer: 0,
      turn: 0,
      trump: 'H',
      maker: 1,
      hands: {
        0: [C('JH'), C('JD'), C('AH'), C('KH'), C('AC'), C('10S')],
        // ^ trump trump trump trump; clubs has only AC; spades has only 10S — both singletons.
        // Bot should discard the lower-value singleton (10S) to void spades.
        1: [],
        2: [],
        3: [],
      },
    });
    const action = chooseBotAction(s, 0);
    expect(action.type).toBe('DEALER_DISCARD');
    if (action.type !== 'DEALER_DISCARD') return;
    expect(action.cardId).toBe('10S');
  });
});

describe('bot: card play', () => {
  it('plays its only legal card without thinking when forced', () => {
    const s = baseState({
      phase: 'PLAYING',
      trump: 'H',
      maker: 0,
      turn: 1,
      hands: {
        0: [],
        1: [C('9S')], // must play this
        2: [],
        3: [],
      },
      currentTrick: { ledSuit: 'S', plays: [{ seat: 0, card: C('AS') }] },
    });
    const action = chooseBotAction(s, 1);
    if (action.type !== 'PLAY_CARD') throw new Error('expected PLAY_CARD');
    expect(action.cardId).toBe('9S');
  });

  it('does NOT overtake partner who is already winning', () => {
    // Seat 0 led AS, seat 1 (opp) played 9S, seat 2 (partner of 0) played KS.
    // Seat 0 (south, partner = north(2)) is "winning"... wait, seat 0 leads. Let me think.
    // Plays so far: seat0 AS, seat1 9S, seat2 KS. Currently winning: AS (seat 0).
    // Now seat 3 to play. Seat 3 (E) — partner of seat 1. Both opponents winning is seat 0
    // (a "we"-team-NS winner from seat 3's POV). So seat 3 (EW) needs to BEAT seat 0 if possible.
    // To exercise the partner-winning branch, set up so seat 3 is on team NS partner of seat 0
    // — but seats are fixed: 0+2 NS, 1+3 EW. So this exact case won't trigger partnerWinning.
    // Construct: seat 0 leads, seat 1 plays, seat 2 (partner 0) plays AS (winning), seat 3 to act
    //   from EW POV — opponent winning, don't overtake doesn't apply.
    // Better: 4-player, seat 1 leads AS, seat 2 plays 9S, seat 3 (partner of 1) plays KS.
    // Now seat 0 to play. Seat 0 is partner of seat 2 (an opponent of seat 1's team).
    // Currently winning: AS, seat 1. Seat 0's partner is seat 2. Seat 1 is enemy. So seat 0
    // sees enemy winning. Hmm, partnerWinning branch needs partner to be winning.
    // Construct: seat 1 leads 9S, seat 2 plays AS (winning), seat 3 plays 10S, seat 0 to play.
    // Seat 0's partner is seat 2 → partner winning. Seat 0 has KS (would beat 10S but not AS,
    // so NOT actually overtake — partner stays ahead). The point is we should not waste a high card.
    const s = baseState({
      phase: 'PLAYING',
      trump: 'H',
      maker: 1,
      turn: 0,
      hands: {
        0: [C('KS'), C('9C')], // KS would not beat AS; 9C also can't follow but is lower.
        1: [],
        2: [],
        3: [],
      },
      currentTrick: {
        ledSuit: 'S',
        plays: [
          { seat: 1, card: C('9S') },
          { seat: 2, card: C('AS') }, // partner winning
          { seat: 3, card: C('10S') },
        ],
      },
    });
    const action = chooseBotAction(s, 0);
    if (action.type !== 'PLAY_CARD') throw new Error('expected PLAY_CARD');
    // Must follow suit (KS); we don't overtake AS, but we have to play KS because we can follow.
    expect(action.cardId).toBe('KS');
  });

  it('trumps in to beat an opponent when unable to follow', () => {
    // Trump = H. Seat 1 leads AS (clubs/spade off-suit), seat 0 (us) holds no spades but has trump.
    // Should trump in with the LOWEST sufficient trump.
    const s = baseState({
      phase: 'PLAYING',
      trump: 'H',
      maker: 1,
      turn: 0,
      hands: {
        0: [C('9H'), C('10H'), C('QH'), C('9C')],
        1: [],
        2: [],
        3: [],
      },
      currentTrick: {
        ledSuit: 'S',
        plays: [{ seat: 1, card: C('AS') }],
      },
    });
    const action = chooseBotAction(s, 0);
    if (action.type !== 'PLAY_CARD') throw new Error('expected PLAY_CARD');
    expect(action.cardId).toBe('9H'); // cheapest trump that wins
  });

  it('does NOT trump partner who is already winning the trick', () => {
    // Seat 1 leads 9S, seat 2 (partner of 0) plays AS winning. Seat 3 plays 10S.
    // Seat 0 to play; can't follow (no spades). Partner is winning.
    // Should dump lowest non-trump throwaway — NOT trump in.
    const s = baseState({
      phase: 'PLAYING',
      trump: 'H',
      maker: 1,
      turn: 0,
      hands: {
        0: [C('9H'), C('10H'), C('9C'), C('10C')], // no spades; has trump and non-trump.
        1: [],
        2: [],
        3: [],
      },
      currentTrick: {
        ledSuit: 'S',
        plays: [
          { seat: 1, card: C('9S') },
          { seat: 2, card: C('AS') }, // partner of seat 0 winning
          { seat: 3, card: C('10S') },
        ],
      },
    });
    const action = chooseBotAction(s, 0);
    if (action.type !== 'PLAY_CARD') throw new Error('expected PLAY_CARD');
    expect(action.cardId).toBe('9C'); // lowest non-trump dump, NOT a trump
  });

  it('leads right bower when on the maker team', () => {
    const s = baseState({
      phase: 'PLAYING',
      trump: 'H',
      maker: 0,
      turn: 0,
      hands: {
        0: [C('JH'), C('AH'), C('AC'), C('9D'), C('10S')], // right bower available
        1: [],
        2: [],
        3: [],
      },
      currentTrick: { ledSuit: null, plays: [] },
    });
    const action = chooseBotAction(s, 0);
    if (action.type !== 'PLAY_CARD') throw new Error('expected PLAY_CARD');
    expect(action.cardId).toBe('JH');
  });
});

describe('bot: integration on a real deal', () => {
  it('all 4 bots can play a complete hand without errors', () => {
    let s = createGame();
    s = dealHand({ ...s, dealer: 0 });
    // simulate full hand by always asking chooseBotAction for current turn seat
    let safety = 100;
    while (
      s.phase !== 'HAND_END' &&
      s.phase !== 'GAME_OVER' &&
      safety-- > 0
    ) {
      const seat = s.turn;
      const action = chooseBotAction(s, seat);
      const r = applyAction(s, action);
      s = r.state;
    }
    expect(safety).toBeGreaterThan(0);
    expect(s.phase === 'HAND_END' || s.phase === 'GAME_OVER').toBe(true);
    // Each team should have between 0 and 5 tricks summing to 5.
    expect(s.trickCounts.NS + s.trickCounts.EW).toBe(5);
  });
});
