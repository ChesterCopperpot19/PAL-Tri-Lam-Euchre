// Double-dummy hand analysis: plays a recorded hand out perfectly with every card
// face up, then grades each real card against the best alternative. Pure and
// dependency-free apart from the game's own rules, so it runs in a browser Web
// Worker as well as in Node tests.
//
// "Double-dummy" is hindsight. A flagged play may have been perfectly reasonable
// given what the player could actually see; the UI labels every verdict "with
// every card visible" for that reason.

import { cardStrength, effectiveSuit } from '@/server/engine/rules';
import type { Card, HandSummary, SeatIndex, Suit } from '@/server/engine/types';
import { TEAM_OF } from '@/server/engine/types';

export type Option = { card: Card; /** Maker tricks this card leads to, with perfect play after. */ value: number };

export type PlayVerdict = {
  /** 0-based trick and position within the trick. */
  trick: number;
  position: number;
  seat: SeatIndex;
  card: Card;
  /** True when the player is on the making team. */
  maker: boolean;
  /** Tricks given away versus the best card (0 = a best play). */
  cost: number;
  /** The best card, when the played one wasn't (first best in hand order). */
  better: Card | null;
  /** Every legal card and where it leads, in hand order. */
  options: Option[];
  /** Maker tricks forcible with perfect play before and after this card. */
  valueBefore: number;
  valueAfter: number;
};

export type HandAnalysis = {
  makerTeam: 'NS' | 'EW';
  /** Seat sitting out for a loner, else null. */
  sittingOut: SeatIndex | null;
  /** Each seat's five cards, in the order they were played. */
  dealt: Record<SeatIndex, Card[]>;
  /** Maker tricks with perfect play from the opening lead. */
  bestMakerTricks: number;
  /** Maker tricks actually taken. */
  actualMakerTricks: number;
  plays: PlayVerdict[];
  /** Maker tricks forcible before the first play, then after each play. */
  swing: number[];
  /** A misplay changed which side scored (makers reaching 3 tricks or not). */
  decidedByMisplay: boolean;
  /** A march (all 5) was there for the makers and they didn't take it. */
  missedMarch: boolean;
};

/** Why a hand can't be analysed, or null when it can. */
export function unanalyzableReason(h: HandSummary): string | null {
  if (!h.tricks || h.tricks.length === 0) return 'No card-by-card record for this hand.';
  if (h.tricks.length !== 5) return 'This hand’s record is incomplete.';
  const active = h.alone ? 3 : 4;
  const seen = new Set<string>();
  const perSeat = [0, 0, 0, 0];
  for (const t of h.tricks) {
    if (t.plays.length !== active || t.winner === undefined) return 'This hand’s record is incomplete.';
    for (const p of t.plays) {
      if (seen.has(p.card.id)) return 'This hand’s record has a duplicate card.';
      seen.add(p.card.id);
      perSeat[p.seat]++;
    }
  }
  const out = h.alone ? (((h.maker + 2) % 4) as SeatIndex) : null;
  for (let s = 0; s < 4; s++) if (perSeat[s] !== (s === out ? 0 : 5)) return 'This hand’s record is incomplete.';
  return null;
}

/**
 * Grade every play of a recorded hand. Returns null when the record can't be
 * analysed (see `unanalyzableReason`) or doesn't replay under the rules.
 */
export function analyzeHand(h: HandSummary): HandAnalysis | null {
  if (unanalyzableReason(h)) return null;
  const tricks = h.tricks!;
  const trump = h.trump;
  const makerTeam = TEAM_OF[h.maker];
  const sittingOut = h.alone ? (((h.maker + 2) % 4) as SeatIndex) : null;
  const active = sittingOut === null ? 4 : 3;
  const nextSeat = (s: number) => {
    let n = (s + 1) % 4;
    if (n === sittingOut) n = (n + 1) % 4;
    return n;
  };

  // Index every card in play. Each seat's cards keep the order they were played:
  // that is the order alternatives are tried in, which decides which card is named
  // "better" when several tie.
  const cards: Card[] = [];
  const seatCards: number[][] = [[], [], [], []];
  const dealt: Record<SeatIndex, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const t of tricks)
    for (const p of t.plays) {
      seatCards[p.seat].push(cards.length);
      dealt[p.seat].push(p.card);
      cards.push(p.card);
    }
  const idxOf = new Map(cards.map((c, i) => [c.id, i]));
  const eff: Suit[] = cards.map((c) => effectiveSuit(c, trump));
  // strength[i][led] via the engine's own ranking.
  const SUITS: Suit[] = ['H', 'D', 'C', 'S'];
  const strength = cards.map((c) => {
    const bySuit: Record<string, number> = {};
    for (const s of SUITS) bySuit[s] = cardStrength(c, trump, s);
    return bySuit;
  });
  const isMakerSeat = [0, 1, 2, 3].map((s) => TEAM_OF[s as SeatIndex] === makerTeam);

  // Legal cards for `seat` from the remaining-card mask, in hand order.
  function legal(seat: number, rem: number, led: number): number[] {
    const own = seatCards[seat].filter((i) => rem & (1 << i));
    if (led < 0) return own;
    const follow = own.filter((i) => eff[i] === eff[led]);
    return follow.length ? follow : own;
  }

  function winnerOf(trickCards: number[], trickSeats: number[]): number {
    const led = eff[trickCards[0]];
    let best = 0;
    for (let k = 1; k < trickCards.length; k++)
      if (strength[trickCards[k]][led] > strength[trickCards[best]][led]) best = k;
    return trickSeats[best];
  }

  // Maker tricks still to come with perfect play, from the start of a trick.
  // Positions repeat across move orders, so they're memoised on (cards left, leader).
  const memo = new Map<number, number>();
  function fromTrickStart(rem: number, leader: number): number {
    const key = rem * 4 + leader;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const v = midTrick(rem, [], [], leader);
    memo.set(key, v);
    return v;
  }

  // Maker tricks from a mid-trick position, counting the trick in progress.
  function midTrick(rem: number, trickCards: number[], trickSeats: number[], turn: number): number {
    if (trickCards.length === active) {
      const w = winnerOf(trickCards, trickSeats);
      const got = isMakerSeat[w] ? 1 : 0;
      return rem === 0 ? got : got + fromTrickStart(rem, w);
    }
    const max = isMakerSeat[turn];
    let best = max ? -1 : 99;
    for (const c of legal(turn, rem, trickCards.length ? trickCards[0] : -1)) {
      const v = midTrick(rem & ~(1 << c), [...trickCards, c], [...trickSeats, turn], nextSeat(turn));
      if (max ? v > best : v < best) best = v;
    }
    return best;
  }

  // Walk the real hand, grading each card against every legal alternative.
  let rem = (1 << cards.length) - 1;
  let won = 0;
  const plays: PlayVerdict[] = [];
  const bestMakerTricks = fromTrickStart(rem, tricks[0].plays[0].seat);
  const swing = [bestMakerTricks];
  let expectedLeader = tricks[0].plays[0].seat as number;

  for (let ti = 0; ti < tricks.length; ti++) {
    const t = tricks[ti];
    if (t.plays[0].seat !== expectedLeader) return null;
    const trickCards: number[] = [];
    const trickSeats: number[] = [];
    for (let pi = 0; pi < t.plays.length; pi++) {
      const p = t.plays[pi];
      const ci = idxOf.get(p.card.id)!;
      if (pi > 0 && p.seat !== nextSeat(trickSeats[pi - 1])) return null;
      const opts = legal(p.seat, rem, trickCards.length ? trickCards[0] : -1);
      if (!opts.includes(ci)) return null; // not a legal play: the record doesn't replay
      const max = isMakerSeat[p.seat];
      const options: Option[] = opts.map((c) => ({
        card: cards[c],
        value:
          won +
          midTrick(rem & ~(1 << c), [...trickCards, c], [...trickSeats, p.seat], nextSeat(p.seat)),
      }));
      let top = options[0];
      for (const o of options) if (max ? o.value > top.value : o.value < top.value) top = o;
      const actual = options.find((o) => o.card.id === p.card.id)!.value;
      const cost = max ? top.value - actual : actual - top.value;
      plays.push({
        trick: ti,
        position: pi,
        seat: p.seat,
        card: p.card,
        maker: max,
        cost,
        better: cost > 0 ? top.card : null,
        options,
        valueBefore: top.value,
        valueAfter: actual,
      });
      swing.push(actual);
      rem &= ~(1 << ci);
      trickCards.push(ci);
      trickSeats.push(p.seat);
    }
    const w = winnerOf(trickCards, trickSeats);
    if (w !== t.winner) return null; // recorded winner disagrees with the rules
    if (isMakerSeat[w]) won++;
    expectedLeader = w;
  }

  return {
    makerTeam,
    sittingOut,
    dealt,
    bestMakerTricks,
    actualMakerTricks: won,
    plays,
    swing,
    decidedByMisplay: bestMakerTricks >= 3 !== won >= 3,
    missedMarch: bestMakerTricks === 5 && won < 5,
  };
}
