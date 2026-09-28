// Double-dummy core: perfect play with every card face up, from any position in
// a hand. Shared by the hand analyzer, the information-set sampler and the strong
// bot. Pure and dependency-free apart from the game's own rules.
//
// Values are maker tricks still to come (counting the trick in progress). Points
// are a monotone function of maker tricks, and minimax commutes with monotone
// functions, so the double-dummy points of a position are simply
// `makerPoints(tricksTakenSoFar + value)`.

import { cardStrength, effectiveSuit } from '@/server/engine/rules';
import type { Card, SeatIndex, Suit, TrickPlay } from '@/server/engine/types';
import { TEAM_OF } from '@/server/engine/types';

const SUITS: Suit[] = ['H', 'D', 'C', 'S'];

export type Position = {
  trump: Suit;
  maker: SeatIndex;
  /** Seat sitting out for a loner, else null. */
  sittingOut: SeatIndex | null;
  /** Cards still in each seat's hand. Order matters only for tie-breaks. */
  hands: Record<SeatIndex, Card[]>;
  /** Cards already on the table in the trick in progress. */
  trick: TrickPlay[];
  /** Seat to play next. */
  turn: SeatIndex;
};

/** Points to the makers (negative = to the defenders) for a finished hand. */
export function makerPoints(makerTricks: number, alone: boolean): number {
  if (makerTricks < 3) return -2;
  if (makerTricks === 5) return alone ? 4 : 2;
  return 1;
}

export type Solver = ReturnType<typeof createSolver>;

export function createSolver(pos: Position) {
  const { trump, sittingOut } = pos;
  const makerTeam = TEAM_OF[pos.maker];
  const active = sittingOut === null ? 4 : 3;
  const nextSeat = (s: number) => {
    let n = (s + 1) % 4;
    if (n === sittingOut) n = (n + 1) % 4;
    return n;
  };

  // Index every card: those on the table first, then each hand in order.
  const cards: Card[] = [];
  const seatCards: number[][] = [[], [], [], []];
  const tableIdx: number[] = [];
  const tableSeats: number[] = [];
  for (const p of pos.trick) {
    tableIdx.push(cards.length);
    tableSeats.push(p.seat);
    cards.push(p.card);
  }
  let startRem = 0;
  for (const s of [0, 1, 2, 3] as SeatIndex[])
    for (const c of pos.hands[s]) {
      seatCards[s].push(cards.length);
      startRem |= 1 << cards.length;
      cards.push(c);
    }
  const idOf = new Map(cards.map((c, i) => [c.id, i]));
  const eff: Suit[] = cards.map((c) => effectiveSuit(c, trump));
  const strength: Record<string, number>[] = cards.map((c) => {
    const bySuit: Record<string, number> = {};
    for (const s of SUITS) bySuit[s] = cardStrength(c, trump, s);
    return bySuit;
  });
  const isMakerSeat = [0, 1, 2, 3].map((s) => TEAM_OF[s as SeatIndex] === makerTeam);

  function legal(seat: number, rem: number, led: number): number[] {
    const own = seatCards[seat].filter((i) => rem & (1 << i));
    if (led < 0) return own;
    const follow = own.filter((i) => eff[i] === eff[led]);
    return follow.length ? follow : own;
  }

  function winnerOf(tc: number[], ts: number[], n: number): number {
    const led = eff[tc[0]];
    let best = 0;
    for (let k = 1; k < n; k++) if (strength[tc[k]][led] > strength[tc[best]][led]) best = k;
    return ts[best];
  }

  const popcount = (x: number) => {
    let n = 0;
    while (x) {
      x &= x - 1;
      n++;
    }
    return n;
  };

  // Positions at a trick start repeat across move orders: memoise on (cards left, leader).
  const memo = new Map<number, number>();
  function fromTrickStart(rem: number, leader: number): number {
    const key = rem * 4 + leader;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const tc: number[] = [];
    const ts: number[] = [];
    const v = search(rem, tc, ts, leader);
    memo.set(key, v);
    return v;
  }

  // Maker tricks from a mid-trick position (tc/ts: the trick so far, mutated and
  // restored in place), counting the trick in progress.
  function search(rem: number, tc: number[], ts: number[], turn: number): number {
    const n = tc.length;
    if (n === active) {
      const w = winnerOf(tc, ts, n);
      const got = isMakerSeat[w] ? 1 : 0;
      return rem === 0 ? got : got + fromTrickStart(rem, w);
    }
    const max = isMakerSeat[turn];
    // Tricks still to be decided, counting this one: the most the makers can take.
    // Reaching it (or zero, for the defenders) can't be improved on, so stop early.
    const top = n === 0 ? popcount(rem) / active : (popcount(rem) - (active - n)) / active + 1;
    let best = max ? -1 : 99;
    for (const c of legal(turn, rem, n ? tc[0] : -1)) {
      tc.push(c);
      ts.push(turn);
      const v = search(rem & ~(1 << c), tc, ts, nextSeat(turn));
      tc.pop();
      ts.pop();
      if (max ? v > best : v < best) best = v;
      if (max ? best >= top : best <= 0) break; // can't do better than all or nothing
    }
    return best;
  }

  // ---- Yes/no search: can the makers take at least `target` more tricks? ----
  // Points only depend on whether the makers reach 3 and 5, so two of these
  // answer a points question far faster than an exact minimax: a node stops as
  // soon as one reply settles it.
  const reachMemo = new Map<number, boolean>();
  function reachFromStart(rem: number, leader: number, target: number): boolean {
    if (target <= 0) return true;
    if (target > popcount(rem) / active) return false;
    const key = (rem * 4 + leader) * 8 + target;
    const hit = reachMemo.get(key);
    if (hit !== undefined) return hit;
    const v = reach(rem, [], [], leader, target);
    reachMemo.set(key, v);
    return v;
  }
  function reach(rem: number, tc: number[], ts: number[], turn: number, target: number): boolean {
    const n = tc.length;
    if (n === active) {
      const w = winnerOf(tc, ts, n);
      const t = target - (isMakerSeat[w] ? 1 : 0);
      return rem === 0 ? t <= 0 : reachFromStart(rem, w, t);
    }
    const max = isMakerSeat[turn];
    for (const c of legal(turn, rem, n ? tc[0] : -1)) {
      tc.push(c);
      ts.push(turn);
      const v = reach(rem & ~(1 << c), tc, ts, nextSeat(turn), target);
      tc.pop();
      ts.pop();
      if (max && v) return true; // makers found a way
      if (!max && !v) return false; // defenders found a stop
    }
    return !max;
  }

  /** Points to the makers (with perfect play) if the seat to play plays `id`
   *  now, given `won` maker tricks already taken this hand. */
  function pointsOfMove(id: string, won: number, alone: boolean): number {
    const c = idOf.get(id)!;
    const rem = startRem & ~(1 << c);
    const tc = [...tableIdx, c];
    const ts = [...tableSeats, pos.turn];
    const next = nextSeat(pos.turn);
    if (!reach(rem, tc.slice(), ts.slice(), next, 3 - won)) return -2;
    if (reach(rem, tc.slice(), ts.slice(), next, 5 - won)) return alone ? 4 : 2;
    return 1;
  }

  /** Points to the makers (with perfect play) from this position. */
  function pointsNow(won: number, alone: boolean): number {
    const at = (target: number) =>
      tableIdx.length === 0
        ? reachFromStart(startRem, pos.turn, target)
        : reach(startRem, tableIdx.slice(), tableSeats.slice(), pos.turn, target);
    if (!at(3 - won)) return -2;
    if (at(5 - won)) return alone ? 4 : 2;
    return 1;
  }

  /** Maker tricks to come if `seat` plays card `id` now, with perfect play after. */
  function valueOfMove(id: string): number {
    const c = idOf.get(id)!;
    const tc = tableIdx.slice();
    const ts = tableSeats.slice();
    tc.push(c);
    ts.push(pos.turn);
    return search(startRem & ~(1 << c), tc, ts, nextSeat(pos.turn));
  }

  /** Maker tricks to come from this position, with perfect play by everyone. */
  function value(): number {
    if (tableIdx.length === 0) return fromTrickStart(startRem, pos.turn);
    return search(startRem, tableIdx.slice(), tableSeats.slice(), pos.turn);
  }

  /** Legal cards for the seat to play, in hand order. */
  function legalMoves(): Card[] {
    return legal(pos.turn, startRem, tableIdx.length ? tableIdx[0] : -1).map((i) => cards[i]);
  }

  return { value, valueOfMove, pointsNow, pointsOfMove, legalMoves, makerTeam, active };
}
