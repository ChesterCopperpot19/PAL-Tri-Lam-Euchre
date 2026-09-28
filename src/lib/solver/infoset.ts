// Information sets: what one seat can actually know at a decision point, and
// random deals of the unseen cards that are consistent with it.
//
// A seat knows its own hand, the upcard and the dealer, whether the dealer picked
// the upcard up (and so still holds it until it's played), the bids, every card
// played so far, and the voids each player has revealed by failing to follow suit
// (with the left bower counted as trump). Everything else is dealt at random.

import { buildDeck } from '@/server/engine/deck';
import { effectiveSuit } from '@/server/engine/rules';
import type { Card, GameState, SeatIndex, Suit, TrickPlay } from '@/server/engine/types';

export type InfoSet = {
  seat: SeatIndex;
  trump: Suit | null;
  dealer: SeatIndex;
  sittingOut: SeatIndex | null;
  myHand: Card[];
  upcard: Card | null;
  /** The dealer picked the upcard up and hasn't played it yet (and isn't us). */
  dealerHoldsUpcard: boolean;
  /** Cards no hidden hand can hold: played, turned down, or our own discard. */
  out: Card[];
  /** Cards still to come from each seat. */
  counts: Record<SeatIndex, number>;
  /** Effective suits each seat has shown it can't follow. */
  voids: Record<SeatIndex, Set<Suit>>;
};

const SEATS: SeatIndex[] = [0, 1, 2, 3];

/** Voids revealed by failing to follow the led (effective) suit. */
export function revealedVoids(tricks: { plays: TrickPlay[] }[], trump: Suit | null): Record<SeatIndex, Set<Suit>> {
  const voids: Record<SeatIndex, Set<Suit>> = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() };
  if (!trump) return voids;
  for (const t of tricks) {
    if (t.plays.length === 0) continue;
    const led = effectiveSuit(t.plays[0].card, trump);
    for (const p of t.plays.slice(1)) if (effectiveSuit(p.card, trump) !== led) voids[p.seat].add(led);
  }
  return voids;
}

/** A live seat's view of the game, straight from the engine state. */
export function infoFromState(state: GameState, seat: SeatIndex): InfoSet {
  // Only the dealer knows which card they buried.
  const ownDiscard = seat === state.dealer ? state.dealerDiscard ?? null : null;
  const sittingOut = state.sittingOut[0] ?? null;
  const tricks = [...state.completedTricks, state.currentTrick];
  const played = tricks.flatMap((t) => t.plays.map((p) => p.card));
  const playedIds = new Set(played.map((c) => c.id));
  const upcard = state.upcard;
  const out = [...played];
  if (ownDiscard) out.push(ownDiscard);
  // Not taken: face up on the kitty (round 1) or turned down (round 2). Either way
  // no hidden hand holds it; bid evaluation hands it to the dealer itself.
  if (upcard && !state.upcardTaken) out.push(upcard);
  // Buried under a sitting-out dealer (see BID_ORDER): out of play.
  const upcardBuried = !!upcard && state.upcardTaken && state.sittingOut.includes(state.dealer);
  if (upcard && upcardBuried) out.push(upcard);
  const dealerHoldsUpcard =
    !!upcard && state.upcardTaken && !upcardBuried && seat !== state.dealer && !playedIds.has(upcard.id);
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<SeatIndex, number>;
  for (const s of SEATS) counts[s] = s === sittingOut ? 0 : state.hands[s].length;
  // During the discard the dealer briefly holds six; count what they'll keep.
  if (state.phase === 'DEALER_DISCARD' && seat !== state.dealer) counts[state.dealer] = 5;
  return {
    seat,
    trump: state.trump,
    dealer: state.dealer,
    sittingOut,
    myHand: state.hands[seat].slice(),
    upcard,
    dealerHoldsUpcard,
    out,
    counts,
    voids: revealedVoids(tricks, state.trump),
  };
}

/** A small, fast, seedable PRNG (mulberry32), so results are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DECK = buildDeck();

/**
 * Deal the unseen cards to the other seats at random, consistent with the
 * information set. Returns each seat's full remaining hand (ours included), or
 * null if no consistent deal was found (shouldn't happen for a real game).
 */
export function sampleDeal(info: InfoSet, rand: () => number): Record<SeatIndex, Card[]> | null {
  const known = new Set([...info.myHand, ...info.out].map((c) => c.id));
  if (info.dealerHoldsUpcard && info.upcard) known.add(info.upcard.id);
  const pool = DECK.filter((c) => !known.has(c.id));
  const others = SEATS.filter((s) => s !== info.seat && s !== info.sittingOut);
  const need: Record<number, number> = {};
  for (const s of others) need[s] = info.counts[s] - (info.dealerHoldsUpcard && s === info.dealer ? 1 : 0);
  const allowed = (c: Card, s: SeatIndex) => !info.trump || !info.voids[s].has(effectiveSuit(c, info.trump));
  // Most constrained seat first; a reshuffle almost always fixes a dead end.
  const order = others.slice().sort((a, b) => info.voids[b].size - info.voids[a].size);

  for (let attempt = 0; attempt < 50; attempt++) {
    const deck = pool.slice();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const hands: Record<SeatIndex, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
    hands[info.seat] = info.myHand.slice();
    const used = new Set<string>();
    let ok = true;
    for (const s of order) {
      for (const c of deck) {
        if (hands[s].length >= need[s]) break;
        if (!used.has(c.id) && allowed(c, s)) {
          hands[s].push(c);
          used.add(c.id);
        }
      }
      if (hands[s].length < need[s]) {
        ok = false;
        break;
      }
      if (info.dealerHoldsUpcard && s === info.dealer && info.upcard) hands[s].push(info.upcard);
    }
    if (ok) return hands;
  }
  return null;
}
