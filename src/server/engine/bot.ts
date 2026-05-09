// Heuristic Euchre AI. Plays "smartest practical" moves — not optimal minimax,
// but follows the standard expert-Euchre playbook:
//   - Order up only with sufficient trump strength, weighting upcard giveaway
//   - Win with the cheapest card that wins; never overtake your partner
//   - Trump in only when an opponent leads the trick and we can't follow
//   - Lead winners early (right bower, off-suit aces); save weak trumps for trumping in
//   - Discard to void a suit when possible (so you can trump that suit later)

import {
  ALL_SUITS,
  Action,
  Card,
  GameState,
  PARTNER,
  Rank,
  SeatIndex,
  Suit,
} from './types';
import {
  cardStrength,
  effectiveSuit,
  isLeftBower,
  isRightBower,
  leftBowerSuit,
  legalPlays,
} from './rules';

/** Public entry point. */
export function chooseBotAction(state: GameState, seat: SeatIndex): Action {
  switch (state.phase) {
    case 'BIDDING_1':
      return chooseBidRound1(state, seat);
    case 'BIDDING_2':
      return chooseBidRound2(state, seat);
    case 'DEALER_DISCARD':
      return chooseDealerDiscard(state, seat);
    case 'PLAYING':
      return chooseCardPlay(state, seat);
    default:
      throw new Error(`bot inactive in phase ${state.phase}`);
  }
}

// ---------- HAND-STRENGTH SCORING ----------

const NON_BOWER_TRUMP_VALUE: Record<Exclude<Rank, 'J'>, number> = {
  '9': 0.5,
  '10': 0.8,
  Q: 1.0,
  K: 1.5,
  A: 2.0,
};

/** Standalone strength of a single card, treating `trump` as trump. */
function cardTrumpValue(card: Card, trump: Suit): number {
  if (isRightBower(card, trump)) return 4;
  if (isLeftBower(card, trump)) return 3;
  if (card.suit === trump) {
    return NON_BOWER_TRUMP_VALUE[card.rank as Exclude<Rank, 'J'>] ?? 0;
  }
  if (card.rank === 'A') return 1;
  if (card.rank === 'K') return 0.3;
  return 0.05;
}

/** Aggregate hand value if `trump` were trump. Includes shape bonuses. */
function scoreHandForTrump(hand: Card[], trump: Suit): number {
  let total = 0;
  let trumpCount = 0;
  const offCounts: Record<Suit, number> = { H: 0, D: 0, C: 0, S: 0 };

  for (const c of hand) {
    const eff = effectiveSuit(c, trump);
    if (eff === trump) trumpCount++;
    else offCounts[eff]++;
    total += cardTrumpValue(c, trump);
  }

  // Shape bonuses: voids let you trump in immediately; singletons let you void on the
  // first lead of that suit.
  for (const s of ALL_SUITS) {
    if (s === trump) continue;
    if (offCounts[s] === 0) total += 0.6;
    else if (offCounts[s] === 1) total += 0.2;
  }
  if (trumpCount >= 3) total += 0.4;
  if (trumpCount >= 4) total += 0.6;

  return total;
}

function hasBothBowers(hand: Card[], trump: Suit): boolean {
  return (
    hand.some((c) => isRightBower(c, trump)) && hand.some((c) => isLeftBower(c, trump))
  );
}

/** Lowest-value card in a list, given current trump and led suit context. */
function lowest(cards: Card[], trump: Suit, ledEff: Suit | null): Card {
  let best = cards[0];
  let bestS = cardStrength(best, trump, ledEff);
  for (let i = 1; i < cards.length; i++) {
    const s = cardStrength(cards[i], trump, ledEff);
    if (s < bestS) {
      best = cards[i];
      bestS = s;
    }
  }
  return best;
}

/** Discard-time "low" comparator: prefers lower rank, off-suit over trump.
 *  Used during dealer discard where there's no led suit context. */
function lowestForDiscard(cards: Card[], trump: Suit): Card {
  const rankIdx: Record<string, number> = {
    '9': 1,
    '10': 2,
    J: 3,
    Q: 4,
    K: 5,
    A: 6,
  };
  let best = cards[0];
  let bestKey = (effectiveSuit(best, trump) === trump ? 100 : 0) + rankIdx[best.rank];
  for (let i = 1; i < cards.length; i++) {
    const c = cards[i];
    const key = (effectiveSuit(c, trump) === trump ? 100 : 0) + rankIdx[c.rank];
    if (key < bestKey) {
      best = c;
      bestKey = key;
    }
  }
  return best;
}

function highest(cards: Card[], trump: Suit, ledEff: Suit | null): Card {
  let best = cards[0];
  let bestS = cardStrength(best, trump, ledEff);
  for (let i = 1; i < cards.length; i++) {
    const s = cardStrength(cards[i], trump, ledEff);
    if (s > bestS) {
      best = cards[i];
      bestS = s;
    }
  }
  return best;
}

function currentWinner(plays: { seat: number; card: Card }[], trump: Suit): { seat: number; card: Card } {
  const ledEff = effectiveSuit(plays[0].card, trump);
  let best = plays[0];
  let bestS = cardStrength(best.card, trump, ledEff);
  for (let i = 1; i < plays.length; i++) {
    const s = cardStrength(plays[i].card, trump, ledEff);
    if (s > bestS) {
      best = plays[i];
      bestS = s;
    }
  }
  return best;
}

// ---------- BIDDING ----------

function chooseBidRound1(state: GameState, seat: SeatIndex): Action {
  const hand = state.hands[seat];
  const upcard = state.upcard!;
  const trump = upcard.suit;
  const isDealer = seat === state.dealer;
  const dealerIsPartner = PARTNER[seat] === state.dealer;

  let h = scoreHandForTrump(hand, trump);
  if (isDealer) {
    // We take the upcard. Add its trump value, subtract our weakest card we'd discard.
    h += cardTrumpValue(upcard, trump);
    // Approximate the discard cost as the value of the weakest card.
    const weakest = lowest(hand, trump, null);
    h -= cardTrumpValue(weakest, trump);
  } else if (dealerIsPartner) {
    h += cardTrumpValue(upcard, trump) * 0.4;
  } else {
    // Opponent dealer pockets the upcard — that's bad, especially if it's a bower.
    h -= cardTrumpValue(upcard, trump) * 0.7;
  }

  // Threshold (lower for dealer who gets free card; higher when feeding opponent).
  const threshold = isDealer ? 4.0 : dealerIsPartner ? 4.5 : 5.5;

  if (h >= threshold) {
    const alone = h >= 9 && hasBothBowers(hand, trump) && hand.some((c) => c.rank === 'A');
    return { type: 'BID_ORDER', seat, alone };
  }
  return { type: 'BID_PASS', seat };
}

function chooseBidRound2(state: GameState, seat: SeatIndex): Action {
  const hand = state.hands[seat];
  const upcardSuit = state.upcard!.suit;
  const candidates = ALL_SUITS.filter((s) => s !== upcardSuit);

  // Bias slightly toward same-color suits (since the would-be left bower of upcard is now
  // available as a regular card — but more importantly, calling next is a known heuristic).
  const lbOfUpcard = leftBowerSuit(upcardSuit);

  let best: { suit: Suit; score: number } | null = null;
  for (const s of candidates) {
    let score = scoreHandForTrump(hand, s);
    if (s === lbOfUpcard) score += 0.2; // "next" bias
    if (!best || score > best.score) best = { suit: s, score };
  }

  const isDealer = seat === state.dealer;
  if (isDealer) {
    // Stick the dealer: must call.
    const alone =
      best!.score >= 9 && hasBothBowers(hand, best!.suit) && hand.some((c) => c.rank === 'A');
    return { type: 'BID_CALL', seat, suit: best!.suit, alone };
  }

  if (best && best.score >= 5.0) {
    const alone =
      best.score >= 9 && hasBothBowers(hand, best.suit) && hand.some((c) => c.rank === 'A');
    return { type: 'BID_CALL', seat, suit: best.suit, alone };
  }
  return { type: 'BID_PASS', seat };
}

// ---------- DEALER DISCARD ----------

function chooseDealerDiscard(state: GameState, seat: SeatIndex): Action {
  const hand = state.hands[seat];
  const trump = state.trump!;

  // Group cards by their effective suit. Trump goes in its own bucket.
  const bySuit: Record<Suit, Card[]> = { H: [], D: [], C: [], S: [] };
  for (const c of hand) {
    const eff = effectiveSuit(c, trump);
    bySuit[eff].push(c);
  }

  // Off-suit singletons: discarding one creates a void → can trump in next time.
  const offSuitsWithSingleton = ALL_SUITS.filter(
    (s) => s !== trump && bySuit[s].length === 1
  );
  if (offSuitsWithSingleton.length > 0) {
    const singletons = offSuitsWithSingleton.map((s) => bySuit[s][0]);
    const target = lowestForDiscard(singletons, trump);
    return { type: 'DEALER_DISCARD', seat, cardId: target.id };
  }

  // Otherwise discard the lowest non-trump (favor lowest rank).
  const offSuit = hand.filter((c) => effectiveSuit(c, trump) !== trump);
  if (offSuit.length > 0) {
    const target = lowestForDiscard(offSuit, trump);
    return { type: 'DEALER_DISCARD', seat, cardId: target.id };
  }

  // All trump (rare). Discard the lowest trump.
  const target = lowestForDiscard(hand, trump);
  return { type: 'DEALER_DISCARD', seat, cardId: target.id };
}

// ---------- PLAY ----------

function chooseCardPlay(state: GameState, seat: SeatIndex): Action {
  const hand = state.hands[seat];
  const trump = state.trump!;
  const led = state.currentTrick.plays[0]?.card ?? null;
  const legal = legalPlays(hand, led, trump);

  if (legal.length === 1) return { type: 'PLAY_CARD', seat, cardId: legal[0].id };

  if (!led) {
    return { type: 'PLAY_CARD', seat, cardId: chooseLead(state, seat, hand).id };
  }
  return {
    type: 'PLAY_CARD',
    seat,
    cardId: chooseFollow(state, seat, legal, led).id,
  };
}

/** Pick the best card to lead. */
function chooseLead(state: GameState, seat: SeatIndex, hand: Card[]): Card {
  const trump = state.trump!;
  const tricksPlayed = state.completedTricks.length;
  const isMaker = state.maker === seat || PARTNER[state.maker!] === seat;

  // Right bower if we have it — pulls trumps out and is unbeatable.
  const right = hand.find((c) => isRightBower(c, trump));
  if (right && (isMaker || tricksPlayed === 0)) return right;

  // Off-suit ace — likely a winner before opponents void.
  const offAces = hand.filter((c) => c.rank === 'A' && c.suit !== trump);
  if (offAces.length > 0) {
    // Pick the off-ace whose suit we have fewest of (to free our hand).
    const counts: Record<Suit, number> = { H: 0, D: 0, C: 0, S: 0 };
    for (const c of hand) counts[c.suit]++;
    offAces.sort((a, b) => counts[a.suit] - counts[b.suit]);
    return offAces[0];
  }

  // Otherwise lead lowest non-trump (save trump for ruffing).
  const nonTrump = hand.filter((c) => effectiveSuit(c, trump) !== trump);
  if (nonTrump.length > 0) return lowest(nonTrump, trump, null);

  // All trump → lead highest trump (force the issue).
  return highest(hand, trump, null);
}

/** Pick the best card to play when following a led card. */
function chooseFollow(
  state: GameState,
  seat: SeatIndex,
  legal: Card[],
  led: Card
): Card {
  const trump = state.trump!;
  const ledEff = effectiveSuit(led, trump);
  const plays = state.currentTrick.plays;
  const winning = currentWinner(plays, trump);
  const partnerWinning = winning.seat === PARTNER[seat];
  const isLastToPlay = plays.length === 4 - state.sittingOut.length - 1;

  // Cards in `legal` that would currently win the trick.
  const winners = legal.filter(
    (c) => cardStrength(c, trump, ledEff) > cardStrength(winning.card, trump, ledEff)
  );

  if (partnerWinning) {
    // Don't waste cards on a trick partner is winning.
    // Special case: if partner is winning with a low card and we are last to play and have
    // a sure winner of equal-or-lower value... no, always prefer letting partner take it.
    // Throw lowest legal, preferring non-trump.
    const nonTrump = legal.filter((c) => effectiveSuit(c, trump) !== trump);
    if (nonTrump.length > 0) return lowest(nonTrump, trump, ledEff);
    return lowest(legal, trump, ledEff);
  }

  // Opponent winning. Try to beat them as cheaply as possible.
  if (winners.length > 0) {
    // If we're last and can win, do it cheaply.
    // If not last, weigh whether it's worth trumping in:
    //   - If we're following suit (winners are all led-suit), winning is "free" — go ahead.
    //   - If we'd have to trump in (legal contains all cards because we can't follow),
    //     prefer the cheapest trump that wins.
    const nonTrumpWinners = winners.filter((c) => effectiveSuit(c, trump) !== trump);
    if (nonTrumpWinners.length > 0) return lowest(nonTrumpWinners, trump, ledEff);
    return lowest(winners, trump, ledEff);
  }

  // Can't win and partner isn't winning. Throw away.
  // Prefer to dump non-trump first (save trump for later).
  const nonTrump = legal.filter((c) => effectiveSuit(c, trump) !== trump);
  if (nonTrump.length > 0) return lowest(nonTrump, trump, ledEff);
  // Only trump left — burn lowest trump.
  return lowest(legal, trump, ledEff);
}

export const _internal = {
  scoreHandForTrump,
  cardTrumpValue,
  hasBothBowers,
  chooseLead,
  chooseFollow,
};
