import { buildDeck, mulberry32, shuffle } from './deck';
import { effectiveSuit, legalPlays, trickWinner } from './rules';
import {
  Action,
  ApplyResult,
  ALL_SUITS,
  Card,
  GameState,
  HandSummary,
  PARTNER,
  POINTS_TO_WIN,
  Phase,
  SeatIndex,
  Suit,
  TEAM_OF,
} from './types';

export function emptyHands(): Record<SeatIndex, Card[]> {
  return { 0: [], 1: [], 2: [], 3: [] };
}

export function createGame(): GameState {
  return {
    phase: 'LOBBY',
    hands: emptyHands(),
    kitty: [],
    upcard: null,
    upcardTaken: false,
    trump: null,
    maker: null,
    alone: false,
    sittingOut: [],
    dealer: 0,
    turn: 1,
    bidActions: 0,
    completedTricks: [],
    currentTrick: { ledSuit: null, plays: [] },
    scores: { NS: 0, EW: 0 },
    trickCounts: { NS: 0, EW: 0 },
    lastHand: null,
    history: [],
    bidLog: [],
    seed: Math.floor(Math.random() * 0xffffffff),
  };
}

const SEATS: SeatIndex[] = [0, 1, 2, 3];
const next = (s: SeatIndex): SeatIndex => (((s as number) + 1) % 4) as SeatIndex;

/** Advance turn cursor, skipping any sitting-out players. */
function advanceTurn(state: GameState, from: SeatIndex): SeatIndex {
  let s = next(from);
  for (let i = 0; i < 4; i++) {
    if (!state.sittingOut.includes(s)) return s;
    s = next(s);
  }
  return s;
}

/** Deal: 5 cards to each of 4 seats, plus 4-card kitty with top card flipped as upcard. */
export function dealHand(state: GameState): GameState {
  const rand = mulberry32(state.seed);
  const deck = shuffle(buildDeck(), rand);
  const hands: Record<SeatIndex, Card[]> = emptyHands();
  let i = 0;
  for (const seat of SEATS) {
    hands[seat] = deck.slice(i, i + 5);
    i += 5;
  }
  const kitty = deck.slice(i, i + 4);
  const upcard = kitty[0];
  const dealer = state.dealer;
  return {
    ...state,
    phase: 'BIDDING_1',
    hands,
    kitty,
    upcard,
    upcardTaken: false,
    trump: null,
    maker: null,
    alone: false,
    sittingOut: [],
    bidActions: 0,
    completedTricks: [],
    currentTrick: { ledSuit: null, plays: [] },
    trickCounts: { NS: 0, EW: 0 },
    lastHand: null,
    bidLog: [],
    turn: next(dealer),
    seed: (Math.imul(state.seed, 1664525) + 1013904223) >>> 0, // re-seed for next deal
  };
}

function setSittingOut(state: GameState): GameState {
  if (!state.alone || state.maker == null) return { ...state, sittingOut: [] };
  return { ...state, sittingOut: [PARTNER[state.maker]] };
}

/** Score the current hand based on trick counts and update scores. Returns updated state at HAND_END. */
function scoreHand(state: GameState): GameState {
  if (state.maker == null || state.trump == null) throw new Error('cannot score: no maker');
  const makersTeam = TEAM_OF[state.maker];
  const defendersTeam = makersTeam === 'NS' ? 'EW' : 'NS';
  const makerTricks = state.trickCounts[makersTeam];
  const defenderTricks = state.trickCounts[defendersTeam];
  let pointsAwarded: { NS: number; EW: number } = { NS: 0, EW: 0 };
  let euchred = false;
  let march = false;
  if (makerTricks >= 3) {
    if (makerTricks === 5) {
      march = true;
      pointsAwarded[makersTeam] = state.alone ? 4 : 2;
    } else {
      pointsAwarded[makersTeam] = 1;
    }
  } else {
    euchred = true;
    pointsAwarded[defendersTeam] = 2;
  }
  const newScores = {
    NS: state.scores.NS + pointsAwarded.NS,
    EW: state.scores.EW + pointsAwarded.EW,
  };
  const tricksBySeat: Record<SeatIndex, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const t of state.completedTricks) {
    if (t.winner !== undefined) tricksBySeat[t.winner as SeatIndex]++;
  }
  const summary: HandSummary = {
    trump: state.trump,
    maker: state.maker,
    alone: state.alone,
    tricksByTeam: { ...state.trickCounts },
    tricksBySeat,
    pointsAwarded,
    euchred,
    march,
    dealer: state.dealer,
    upcard: state.upcard,
    orderedUp: state.upcardTaken,
    bidRound: state.upcardTaken ? 1 : 2,
    bids: state.bidLog,
    tricks: state.completedTricks,
  };
  const gameOver = newScores.NS >= POINTS_TO_WIN || newScores.EW >= POINTS_TO_WIN;
  return {
    ...state,
    phase: gameOver ? 'GAME_OVER' : 'HAND_END',
    scores: newScores,
    lastHand: summary,
    history: [...state.history, summary],
  };
}

/** Begin the next hand: rotate dealer, deal new cards. */
export function startNextHand(state: GameState): GameState {
  if (state.phase === 'GAME_OVER') return state;
  const newDealer = next(state.dealer);
  return dealHand({ ...state, dealer: newDealer });
}

export function applyAction(state: GameState, action: Action): ApplyResult {
  const events: string[] = [];

  switch (action.type) {
    case 'START_HAND': {
      if (state.phase !== 'LOBBY' && state.phase !== 'HAND_END') {
        throw new Error(`cannot start hand from phase ${state.phase}`);
      }
      const dealt = state.phase === 'LOBBY' ? dealHand(state) : startNextHand(state);
      events.push('hand_dealt');
      return { state: dealt, events };
    }

    case 'BID_ORDER': {
      if (state.phase !== 'BIDDING_1') throw new Error('not in BIDDING_1');
      if (action.seat !== state.turn) throw new Error('not your turn');
      if (!state.upcard) throw new Error('no upcard');
      // Lone caller sits partner out.
      const trump = state.upcard.suit;
      let s: GameState = {
        ...state,
        trump,
        maker: action.seat,
        alone: action.alone,
        bidLog: [...state.bidLog, { seat: action.seat, action: 'order', round: 1, suit: trump, alone: action.alone }],
        phase: 'DEALER_DISCARD',
        // Add upcard to dealer's hand; dealer will discard one.
        hands: {
          ...state.hands,
          [state.dealer]: [...state.hands[state.dealer], state.upcard],
        },
        upcardTaken: true,
        turn: state.dealer,
      };
      s = setSittingOut(s);
      events.push(`bid_order:${action.seat}:${trump}${action.alone ? ':alone' : ''}`);
      return { state: s, events };
    }

    case 'BID_PASS': {
      if (action.seat !== state.turn) throw new Error('not your turn');
      if (state.phase === 'BIDDING_1') {
        const acted = state.bidActions + 1;
        if (acted >= 4) {
          // Move to round 2.
          return {
            state: {
              ...state,
              phase: 'BIDDING_2',
              bidActions: 0,
              turn: next(state.dealer),
              bidLog: [...state.bidLog, { seat: action.seat, action: 'pass', round: 1 }],
            },
            events: ['bid_round1_all_passed'],
          };
        }
        return {
          state: { ...state, bidActions: acted, turn: next(state.turn), bidLog: [...state.bidLog, { seat: action.seat, action: 'pass', round: 1 }] },
          events: ['bid_pass'],
        };
      }
      if (state.phase === 'BIDDING_2') {
        // Stick the dealer: dealer cannot pass in round 2.
        if (action.seat === state.dealer) throw new Error('stick the dealer: must call');
        const acted = state.bidActions + 1;
        // 4 actions in round 2 cannot all be passes since dealer must call.
        return {
          state: { ...state, bidActions: acted, turn: next(state.turn), bidLog: [...state.bidLog, { seat: action.seat, action: 'pass', round: 2 }] },
          events: ['bid_pass2'],
        };
      }
      throw new Error('cannot pass in current phase');
    }

    case 'BID_CALL': {
      if (state.phase !== 'BIDDING_2') throw new Error('not in BIDDING_2');
      if (action.seat !== state.turn) throw new Error('not your turn');
      if (!state.upcard) throw new Error('no upcard');
      if (action.suit === state.upcard.suit) throw new Error('cannot call upcard suit in round 2');
      let s: GameState = {
        ...state,
        trump: action.suit,
        maker: action.seat,
        alone: action.alone,
        bidLog: [...state.bidLog, { seat: action.seat, action: 'call', round: 2, suit: action.suit, alone: action.alone }],
        phase: 'PLAYING',
        turn: next(state.dealer),
      };
      s = setSittingOut(s);
      // If alone-maker's partner would lead, skip.
      if (s.sittingOut.includes(s.turn)) s = { ...s, turn: advanceTurn(s, s.turn) };
      events.push(`bid_call:${action.seat}:${action.suit}${action.alone ? ':alone' : ''}`);
      return { state: s, events };
    }

    case 'DEALER_DISCARD': {
      if (state.phase !== 'DEALER_DISCARD') throw new Error('not in DEALER_DISCARD');
      if (action.seat !== state.dealer) throw new Error('only dealer discards');
      const dealerHand = state.hands[state.dealer];
      if (!dealerHand.find((c) => c.id === action.cardId)) throw new Error('card not in hand');
      const newHand = dealerHand.filter((c) => c.id !== action.cardId);
      // After discard each seat has 5 cards.
      let s: GameState = {
        ...state,
        hands: { ...state.hands, [state.dealer]: newHand },
        phase: 'PLAYING',
        turn: next(state.dealer),
      };
      if (s.sittingOut.includes(s.turn)) s = { ...s, turn: advanceTurn(s, s.turn) };
      // Deliberately no cardId — events broadcast to the whole room
      // (spectators included) and the discard must stay private.
      events.push('dealer_discard');
      return { state: s, events };
    }

    case 'PLAY_CARD': {
      if (state.phase !== 'PLAYING') throw new Error('not in PLAYING');
      if (action.seat !== state.turn) throw new Error('not your turn');
      const hand = state.hands[action.seat];
      const card = hand.find((c) => c.id === action.cardId);
      if (!card) throw new Error('card not in hand');
      const led = state.currentTrick.plays[0]?.card ?? null;
      const legal = legalPlays(hand, led, state.trump);
      if (!legal.find((c) => c.id === card.id)) throw new Error('illegal play (must follow suit)');

      const newHand = hand.filter((c) => c.id !== action.cardId);
      const newPlays = [...state.currentTrick.plays, { seat: action.seat, card }];
      const ledSuit = state.currentTrick.ledSuit ?? effectiveSuit(card, state.trump);

      // Count active seats this hand (4 - sittingOut.length). Trick is complete when each has played once.
      const activeCount = 4 - state.sittingOut.length;

      if (newPlays.length < activeCount) {
        return {
          state: {
            ...state,
            hands: { ...state.hands, [action.seat]: newHand },
            currentTrick: { ledSuit, plays: newPlays },
            turn: advanceTurn(state, action.seat),
          },
          events: ['card_played'],
        };
      }

      // Trick complete.
      const winner = trickWinner(newPlays, state.trump) as SeatIndex;
      const winningTeam = TEAM_OF[winner];
      const completedTrick = { ledSuit, plays: newPlays, winner };
      const completedTricks = [...state.completedTricks, completedTrick];
      const trickCounts = {
        ...state.trickCounts,
        [winningTeam]: state.trickCounts[winningTeam] + 1,
      };
      const handDone = completedTricks.length >= 5;
      let s: GameState = {
        ...state,
        hands: { ...state.hands, [action.seat]: newHand },
        currentTrick: { ledSuit: null, plays: [] },
        completedTricks,
        trickCounts,
        turn: winner,
      };
      if (s.sittingOut.includes(s.turn)) s = { ...s, turn: advanceTurn(s, s.turn) };
      events.push(`trick_won:${winner}`);
      if (handDone) {
        s = scoreHand(s);
        events.push('hand_scored');
      }
      return { state: s, events };
    }
  }
}

/** Return list of legal card ids for a given seat, or [] if not their turn. */
export function legalPlayIds(state: GameState, seat: SeatIndex): string[] {
  if (state.phase !== 'PLAYING' || state.turn !== seat) return [];
  const hand = state.hands[seat];
  const led = state.currentTrick.plays[0]?.card ?? null;
  return legalPlays(hand, led, state.trump).map((c) => c.id);
}

export const _internal = { advanceTurn, scoreHand };
