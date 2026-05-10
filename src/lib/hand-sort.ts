// Sort a player's hand for display:
//   • Group cards by suit, with each suit ordered high-to-low.
//   • When trump is set, the left bower (J of same-color off-suit) joins the
//     trump group as second-highest trump.
//   • Trump group is pinned to the FAR RIGHT.
//   • Non-trump suits keep a stable default order.
//
// The sort is deterministic, so removing a card (after a play) preserves the
// relative order of every remaining card — i.e., positions stay put.

import type { Card, Rank, Suit } from '@/server/engine/types';
import { effectiveSuit, isLeftBower, isRightBower } from '@/server/engine/rules';

/** Default left-to-right suit order: ♠ ♥ ♣ ♦ (alternating black-red-black-red). */
const DEFAULT_SUIT_ORDER: Suit[] = ['S', 'H', 'C', 'D'];

const RANK_VALUE: Record<Rank, number> = {
  '9': 1,
  '10': 2,
  J: 3,
  Q: 4,
  K: 5,
  A: 6,
};

/** Sort key for a card. Lower group + lower rankPos = leftward placement. */
function sortKey(card: Card, trump: Suit | null): { group: number; rank: number } {
  const eff = effectiveSuit(card, trump);

  // Build the actual suit-group order: when trump is set, trump goes on the far
  // right and the other three suits keep their default relative order.
  const suitOrder: Suit[] = trump
    ? [...DEFAULT_SUIT_ORDER.filter((s) => s !== trump), trump]
    : DEFAULT_SUIT_ORDER;

  const group = suitOrder.indexOf(eff);

  let rank: number;
  if (trump && eff === trump) {
    // Trump group order: right bower → left bower → A → K → Q → 10 → 9
    if (isRightBower(card, trump)) rank = 100;
    else if (isLeftBower(card, trump)) rank = 99;
    else rank = 80 + RANK_VALUE[card.rank];
  } else {
    rank = RANK_VALUE[card.rank];
  }

  // Negate rank so higher comes first (leftward within its group).
  return { group, rank: -rank };
}

/** Return a new array sorted by sortKey; original is not mutated. */
export function sortHand(hand: Card[], trump: Suit | null): Card[] {
  return hand.slice().sort((a, b) => {
    const ka = sortKey(a, trump);
    const kb = sortKey(b, trump);
    if (ka.group !== kb.group) return ka.group - kb.group;
    return ka.rank - kb.rank;
  });
}
