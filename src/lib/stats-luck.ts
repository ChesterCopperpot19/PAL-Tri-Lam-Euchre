// "Luck index" — who gets dealt the good cards, reconstructed from the trick
// log. In a normal hand every card a player holds gets played across the five
// tricks, so the cards a seat played ≈ the cards that seat was dealt. Two known
// approximations, called out in the UI: the dealer's picked-up up-card replaces
// an unknown discard, and a loner's sitting-out partner plays nothing (that
// seat is skipped for the hand).
//
// Needs the heavy trick log (`stats:hands`), so it's computed inside the
// on-demand panel, not the default dashboard payload.
//
// Baseline caveat — maker-selection bias: the 7/24 "fair share" assumes trump
// is chosen independently of the hands, but trump is NAMED by whoever holds
// the most of it. Every seat's trump count is therefore measured against a suit
// that was selected because someone was long in it, so the club-wide average
// sits above 7·5/24 and the "luck" figure is best read relative to the other
// players, not as an absolute deviation from a random deal.

import type { MatchRecord } from './shared-types';
import type { Card, Suit } from '@/server/engine/types';
import { humanGames } from './stats-analytics';

const SAME_COLOR: Record<Suit, Suit> = { H: 'D', D: 'H', C: 'S', S: 'C' };

/** 24-card deck, 7 trump per deal (six naturals + the left bower). */
export const EXPECTED_TRUMP_PER_HAND = (7 * 5) / 24; // ≈ 1.46
export const EXPECTED_RIGHTS_PER_HAND = 5 / 24; // ≈ 0.21

export function isTrumpCard(card: Card, trump: Suit): boolean {
  return card.suit === trump || (card.rank === 'J' && card.suit === SAME_COLOR[trump]);
}

export type LuckRow = {
  name: string;
  hands: number; // hands with a full 5-card play record
  trumpTotal: number; // trump cards played (left bower counts as trump)
  avgTrump: number; // per hand
  rights: number; // right bowers
  lefts: number; // left bowers
  /** avgTrump − fair expectation. Positive = runs good. */
  luck: number;
};

/** Per-player dealt-card luck from the trick log. Sorted luckiest first. */
export function computeLuck(matches: MatchRecord[]): LuckRow[] {
  const map = new Map<string, { hands: number; trump: number; rights: number; lefts: number }>();

  for (const m of humanGames(matches)) {
    if (!m.hands || m.hands.length === 0) continue;
    const seatName: string[] = [];
    for (const p of m.players) seatName[p.seat] = p.name;
    for (const h of m.hands) {
      if (!h.trump || !h.tricks || h.tricks.length === 0) continue;
      const played = new Map<number, Card[]>();
      for (const t of h.tricks) {
        for (const play of t.plays) {
          const arr = played.get(play.seat) ?? [];
          arr.push(play.card);
          played.set(play.seat, arr);
        }
      }
      for (const [seat, cards] of played) {
        // Only seats with a full 5-card record count (skips a loner's partner
        // and any truncated logs) so the per-hand averages stay comparable.
        if (cards.length !== 5) continue;
        const name = seatName[seat];
        if (!name) continue;
        let acc = map.get(name);
        if (!acc) {
          acc = { hands: 0, trump: 0, rights: 0, lefts: 0 };
          map.set(name, acc);
        }
        acc.hands += 1;
        for (const c of cards) {
          if (!isTrumpCard(c, h.trump)) continue;
          acc.trump += 1;
          if (c.rank === 'J') {
            if (c.suit === h.trump) acc.rights += 1;
            else acc.lefts += 1;
          }
        }
      }
    }
  }

  return [...map.entries()]
    .map(([name, a]) => {
      const avgTrump = a.hands ? a.trump / a.hands : 0;
      return {
        name,
        hands: a.hands,
        trumpTotal: a.trump,
        avgTrump,
        rights: a.rights,
        lefts: a.lefts,
        luck: avgTrump - EXPECTED_TRUMP_PER_HAND,
      };
    })
    .sort((a, b) => b.luck - a.luck);
}
