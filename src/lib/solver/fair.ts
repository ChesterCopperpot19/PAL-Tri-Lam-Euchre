// Fair grading: each recorded card judged on what its player could actually see
// at the time, not with every card face up. For each play we rebuild the player's
// information set (own cards, cards played so far, revealed voids, a picked-up
// upcard still in the dealer's hand), deal the unseen cards many ways consistent
// with it, solve each deal double-dummy, and compare the expected points of every
// legal card. A card within FAIR_TOLERANCE of the best is a sound choice.
//
// Hindsight says what would have worked; this says whether the choice was good.

import { effectiveSuit } from '@/server/engine/rules';
import type { Card, HandSummary, SeatIndex, TrickPlay } from '@/server/engine/types';
import { TEAM_OF } from '@/server/engine/types';
import { createSolver } from './dd';
import { revealedVoids, rng, sampleDeal, type InfoSet } from './infoset';

/** Expected-points gap below which a card counts as a sound choice. */
export const FAIR_TOLERANCE = 0.1;

/** Deals sampled per card. At 300, re-grading with a different seed turns a
 *  'sound' card into a 'mistake' (or back) about once in 1,600 club plays. */
export const FAIR_SAMPLES = 300;

export type FairVerdict = {
  /** Expected points to the player's team for each legal card, in hand order. */
  options: { card: Card; ev: number }[];
  /** The card with the best expected points. */
  best: Card;
  /** Expected points given up versus the best card (0 = the best choice). */
  cost: number;
  /**
   * 'sound': the best card, or within FAIR_TOLERANCE of it.
   * 'mistake': clearly worse by more than FAIR_TOLERANCE: even the low end of
   *   the paired gap (mean minus 2 standard errors, over the same sampled
   *   deals) is past it.
   * 'close': worse on average, but not clearly: a judgment call.
   */
  grade: 'sound' | 'close' | 'mistake';
  samples: number;
};

/**
 * Grade every card of a recorded hand on the information its player had.
 * Returns one verdict per play (null for a forced card with one legal option),
 * or null if the hand has no card-by-card record.
 */
export function fairGrades(h: HandSummary, samples = 60, seed = 1): (FairVerdict | null)[] | null {
  if (!h.tricks || h.tricks.length !== 5) return null;
  const trump = h.trump;
  const sittingOut = h.alone ? (((h.maker + 2) % 4) as SeatIndex) : null;
  const plays: TrickPlay[] = h.tricks.flatMap((t) => t.plays);
  const active = sittingOut === null ? 4 : 3;
  const makerTeam = TEAM_OF[h.maker];

  // Each seat's cards at the start of play: everything it went on to play.
  const dealt: Record<SeatIndex, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const p of plays) dealt[p.seat].push(p.card);
  const upcard = h.upcard ?? null;
  const dealer = h.dealer ?? 0;

  const out: (FairVerdict | null)[] = [];
  let won = 0;
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const trickNo = Math.floor(i / active);
    const trickStart = trickNo * active;
    if (i === trickStart && trickNo > 0) {
      const w = h.tricks[trickNo - 1].winner!;
      if (TEAM_OF[w] === makerTeam) won++;
    }
    const before = plays.slice(0, i);
    const playedIds = new Set(before.map((x) => x.card.id));
    const myHand = dealt[p.seat].filter((c) => !playedIds.has(c.id));
    const trick = plays.slice(trickStart, i);
    const led = trick[0]?.card ?? null;
    const legal = led
      ? (() => {
          const follow = myHand.filter((c) => effectiveSuit(c, trump) === effectiveSuit(led, trump));
          return follow.length ? follow : myHand;
        })()
      : myHand;
    if (legal.length <= 1) {
      out.push(null);
      continue;
    }

    // What this player could know right now.
    const tricksSoFar = [];
    for (let t = 0; t <= trickNo; t++) tricksSoFar.push({ plays: plays.slice(t * active, Math.min(i, (t + 1) * active)) });
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<SeatIndex, number>;
    for (const s of [0, 1, 2, 3] as SeatIndex[]) counts[s] = dealt[s].filter((c) => !playedIds.has(c.id)).length;
    const outCards = before.map((x) => x.card);
    if (upcard && !h.orderedUp) outCards.push(upcard); // turned down, face up to all
    if (upcard && h.orderedUp && dealer === sittingOut) outCards.push(upcard); // buried
    const dealerHoldsUpcard =
      !!upcard && !!h.orderedUp && p.seat !== dealer && dealer !== sittingOut && !playedIds.has(upcard.id);
    const info: InfoSet = {
      seat: p.seat,
      trump,
      dealer,
      sittingOut,
      myHand,
      upcard,
      dealerHoldsUpcard,
      out: outCards,
      counts,
      voids: revealedVoids(tricksSoFar, trump),
    };

    const rand = rng((seed * 1_000_003 + i * 7919) >>> 0);
    // per[k][j]: points for option k on sampled deal j (same deals for every option).
    const per: number[][] = legal.map(() => []);
    const sign = TEAM_OF[p.seat] === makerTeam ? 1 : -1;
    for (let j = 0; j < samples; j++) {
      const hands = sampleDeal(info, rand);
      if (!hands) break;
      const solver = createSolver({ trump, maker: h.maker, sittingOut, hands, trick, turn: p.seat });
      legal.forEach((c, k) => per[k].push(sign * solver.pointsOfMove(c.id, won, h.alone)));
    }
    const n = per[0].length;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const options = legal.map((card, k) => ({ card, ev: mean(per[k]) }));
    let bi = 0;
    for (let k = 1; k < options.length; k++) if (options[k].ev > options[bi].ev) bi = k;
    const mi = options.findIndex((o) => o.card.id === p.card.id);
    const cost = Math.max(0, options[bi].ev - options[mi].ev);
    // Paired gap between the best card and the one played, deal by deal.
    const d = per[bi].map((v, j) => v - per[mi][j]);
    const sd = n > 1 ? Math.sqrt(d.reduce((a, x) => a + (x - cost) ** 2, 0) / (n - 1)) : 0;
    const se = n ? sd / Math.sqrt(n) : 0;
    const grade: FairVerdict['grade'] =
      cost <= FAIR_TOLERANCE ? 'sound' : cost - 2 * se > FAIR_TOLERANCE ? 'mistake' : 'close';
    out.push({ options, best: options[bi].card, cost, grade, samples: n });
  }
  return out;
}
