import { ALL_RANKS, Card, Rank, Suit } from './types';

const RED_SUITS: Suit[] = ['H', 'D'];
const BLACK_SUITS: Suit[] = ['C', 'S'];

/** Same-color suit (the "left bower" suit). */
export function leftBowerSuit(trump: Suit): Suit {
  switch (trump) {
    case 'H':
      return 'D';
    case 'D':
      return 'H';
    case 'C':
      return 'S';
    case 'S':
      return 'C';
  }
}

export function isRightBower(card: Card, trump: Suit): boolean {
  return card.rank === 'J' && card.suit === trump;
}

export function isLeftBower(card: Card, trump: Suit): boolean {
  return card.rank === 'J' && card.suit === leftBowerSuit(trump);
}

/** Suit a card "plays as" given trump — left bower plays as trump. */
export function effectiveSuit(card: Card, trump: Suit | null): Suit {
  if (trump && isLeftBower(card, trump)) return trump;
  return card.suit;
}

const RANK_ORDER: Record<Rank, number> = { '9': 1, '10': 2, J: 3, Q: 4, K: 5, A: 6 };

/**
 * Compute a strength value for `card` given `trump` and the led-suit (effective).
 * Higher = stronger. Strengths only need to compare within the same trick.
 */
export function cardStrength(card: Card, trump: Suit | null, ledEffectiveSuit: Suit | null): number {
  if (trump) {
    if (isRightBower(card, trump)) return 1000;
    if (isLeftBower(card, trump)) return 999;
    if (card.suit === trump) {
      // Non-bower trump. J handled above, so rank order is fine.
      return 800 + RANK_ORDER[card.rank];
    }
  }
  if (ledEffectiveSuit && effectiveSuit(card, trump) === ledEffectiveSuit) {
    return 500 + RANK_ORDER[card.rank];
  }
  return 0;
}

/**
 * Cards in `hand` legal to play given the led card (or null for first card of trick).
 * If a player can follow the led suit (effectively), they MUST.
 */
export function legalPlays(hand: Card[], ledCard: Card | null, trump: Suit | null): Card[] {
  if (!ledCard) return hand.slice();
  const led = effectiveSuit(ledCard, trump);
  const following = hand.filter((c) => effectiveSuit(c, trump) === led);
  return following.length > 0 ? following : hand.slice();
}

/** Determine winning seat of a complete trick. */
export function trickWinner(
  plays: { seat: number; card: Card }[],
  trump: Suit | null
): number {
  if (plays.length === 0) throw new Error('empty trick');
  const ledEff = effectiveSuit(plays[0].card, trump);
  let best = plays[0];
  let bestStrength = cardStrength(best.card, trump, ledEff);
  for (let i = 1; i < plays.length; i++) {
    const s = cardStrength(plays[i].card, trump, ledEff);
    if (s > bestStrength) {
      best = plays[i];
      bestStrength = s;
    }
  }
  return best.seat;
}

/** Convenience: ranks ascending. Used by tests. */
export const RANK_ASC: Rank[] = ALL_RANKS.slice();
