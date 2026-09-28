// The strong bot: every decision (bid, go alone, dealer discard, card play) is
// chosen by expected points over random deals of the unseen cards, each deal
// solved double-dummy. Sampling runs until a time budget, so it adapts to slow
// hardware: fewer deals, same logic. Pure, so it runs in a server worker thread,
// in tests, and in the tournament script.
//
// Scoring from the maker's side: +1 to make, +2 to march, +4 for a lone march,
// and -2 (2 to the defenders) on a euchre.

import type { Action, Card, GameState, SeatIndex, Suit } from '@/server/engine/types';
import { PARTNER, TEAM_OF } from '@/server/engine/types';
import { _internal as heuristic, chooseBotAction } from '@/server/engine/bot';
import { createSolver } from './dd';
import { infoFromState, rng, sampleDeal } from './infoset';

export type StrongOptions = {
  /** Stop sampling after this many milliseconds (checked between deals). */
  budgetMs: number;
  /** Always sample at least this many deals, budget or not. */
  minSamples: number;
  /** Never sample more than this many deals. */
  maxSamples: number;
  /** Seed for the deal sampler (reproducible decisions). */
  seed: number;
  /** Expected points a bid must beat to be made (passing is taken as 0). */
  bidThreshold: number;
};

export const DEFAULT_OPTIONS: StrongOptions = {
  budgetMs: 250,
  minSamples: 8,
  maxSamples: 60,
  seed: 1,
  bidThreshold: 0,
};

export type StrongResult = { action: Action; samples: number; ms: number };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function nextActive(s: number, sittingOut: number | null): SeatIndex {
  let n = (s + 1) % 4;
  if (n === sittingOut) n = (n + 1) % 4;
  return n as SeatIndex;
}

/**
 * Run `evaluate` on fresh consistent deals until the budget runs out, averaging
 * the per-option scores. Every option sees the same deals (less noise when
 * comparing them).
 */
function sampleLoop(
  state: GameState,
  seat: SeatIndex,
  nOptions: number,
  opts: StrongOptions,
  evaluate: (hands: Record<SeatIndex, Card[]>, totals: number[]) => void,
): { means: number[]; samples: number } {
  const info = infoFromState(state, seat);
  const rand = rng(opts.seed);
  const totals = new Array(nOptions).fill(0);
  const start = now();
  let samples = 0;
  while (samples < opts.maxSamples && (samples < opts.minSamples || now() - start < opts.budgetMs)) {
    const hands = sampleDeal(info, rand);
    if (!hands) break;
    evaluate(hands, totals);
    samples++;
  }
  return { means: totals.map((t) => (samples ? t / samples : 0)), samples };
}

/** Double-dummy points for `seat` if `maker` makes `trump` from the opening lead. */
function openingValue(
  hands: Record<SeatIndex, Card[]>,
  seat: SeatIndex,
  dealer: SeatIndex,
  maker: SeatIndex,
  trump: Suit,
  alone: boolean,
): number {
  const sittingOut = alone ? PARTNER[maker] : null;
  const h = sittingOut === null ? hands : { ...hands, [sittingOut]: [] };
  const solver = createSolver({ trump, maker, sittingOut, hands: h, trick: [], turn: nextActive(dealer, sittingOut) });
  const p = solver.pointsNow(0, alone);
  return TEAM_OF[seat] === TEAM_OF[maker] ? p : -p;
}

/** The dealer's hand after picking up the upcard and discarding (heuristically). */
function afterPickup(hand: Card[], upcard: Card, trump: Suit, dealer: SeatIndex): Card[] {
  const six = [...hand, upcard];
  const probe = { hands: { 0: six, 1: six, 2: six, 3: six }, trump } as unknown as GameState;
  const act = heuristic.chooseDealerDiscard(probe, dealer) as { cardId: string };
  return six.filter((c) => c.id !== act.cardId);
}

// ---------- decisions ----------

function choosePlay(state: GameState, seat: SeatIndex, opts: StrongOptions): StrongResult {
  const t0 = now();
  const trump = state.trump!;
  const maker = state.maker!;
  const sittingOut = state.sittingOut[0] ?? null;
  const makerTeam = TEAM_OF[maker];
  const probe = createSolver({
    trump,
    maker,
    sittingOut,
    hands: { 0: [], 1: [], 2: [], 3: [], [seat]: state.hands[seat] },
    trick: state.currentTrick.plays,
    turn: seat,
  });
  const moves = probe.legalMoves();
  if (moves.length === 1) {
    return { action: { type: 'PLAY_CARD', seat, cardId: moves[0].id }, samples: 0, ms: now() - t0 };
  }
  const won = state.trickCounts[makerTeam];
  const { means, samples } = sampleLoop(state, seat, moves.length, opts, (hands, totals) => {
    const solver = createSolver({ trump, maker, sittingOut, hands, trick: state.currentTrick.plays, turn: seat });
    const sign = TEAM_OF[seat] === makerTeam ? 1 : -1;
    moves.forEach((m, i) => {
      totals[i] += sign * solver.pointsOfMove(m.id, won, state.alone);
    });
  });
  // Ties go to the heuristic bot's choice when it's among the best, else hand order.
  const best = Math.max(...means);
  const tied = moves.filter((_, i) => means[i] >= best - 1e-9);
  let pick = tied[0];
  if (tied.length > 1) {
    const h = heuristicPlay(state, seat);
    if (h && tied.some((c) => c.id === h)) pick = tied.find((c) => c.id === h)!;
  }
  return { action: { type: 'PLAY_CARD', seat, cardId: pick.id }, samples, ms: now() - t0 };
}

function heuristicPlay(state: GameState, seat: SeatIndex): string | null {
  try {
    const a = chooseBotAction(state, seat);
    return a.type === 'PLAY_CARD' ? a.cardId : null;
  } catch {
    return null;
  }
}

function chooseDiscard(state: GameState, seat: SeatIndex, opts: StrongOptions): StrongResult {
  const t0 = now();
  const six = state.hands[seat];
  const { means, samples } = sampleLoop(state, seat, six.length, opts, (hands, totals) => {
    six.forEach((d, i) => {
      const mine = six.filter((c) => c.id !== d.id);
      totals[i] += openingValue({ ...hands, [seat]: mine }, seat, state.dealer, state.maker!, state.trump!, state.alone);
    });
  });
  const i = means.indexOf(Math.max(...means));
  return { action: { type: 'DEALER_DISCARD', seat, cardId: six[i].id }, samples, ms: now() - t0 };
}

function chooseBid(state: GameState, seat: SeatIndex, opts: StrongOptions): StrongResult {
  const t0 = now();
  const upcard = state.upcard!;
  const round1 = state.phase === 'BIDDING_1';
  const dealer = state.dealer;
  // Options: [suit, alone] pairs. Round 1 can only make the upcard's suit.
  const suits: Suit[] = round1 ? [upcard.suit] : (['H', 'D', 'C', 'S'] as Suit[]).filter((s) => s !== upcard.suit);
  const options = suits.flatMap((s) => [
    { suit: s, alone: false },
    { suit: s, alone: true },
  ]);
  const { means, samples } = sampleLoop(state, seat, options.length, opts, (hands, totals) => {
    options.forEach((o, i) => {
      let h = hands;
      if (round1) {
        // Ordered up: the dealer takes the upcard and discards, unless the dealer
        // is the loner's sitting-out partner (then it's simply buried).
        const dealerSitsOut = o.alone && PARTNER[seat] === dealer;
        if (!dealerSitsOut) h = { ...hands, [dealer]: afterPickup(hands[dealer], upcard, o.suit, dealer) };
      }
      totals[i] += openingValue(h, seat, dealer, seat, o.suit, o.alone);
    });
  });
  let bi = 0;
  for (let i = 1; i < means.length; i++) if (means[i] > means[bi]) bi = i;
  const mustCall = !round1 && seat === dealer; // stick the dealer
  const ms = now() - t0;
  if (!mustCall && means[bi] <= opts.bidThreshold) return { action: { type: 'BID_PASS', seat }, samples, ms };
  const o = options[bi];
  return {
    action: round1
      ? { type: 'BID_ORDER', seat, alone: o.alone }
      : { type: 'BID_CALL', seat, suit: o.suit, alone: o.alone },
    samples,
    ms,
  };
}

/** Choose an action for `seat`, whose turn it is. */
export function chooseStrongAction(state: GameState, seat: SeatIndex, options: Partial<StrongOptions> = {}): StrongResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  switch (state.phase) {
    case 'BIDDING_1':
    case 'BIDDING_2':
      return chooseBid(state, seat, opts);
    case 'DEALER_DISCARD':
      return chooseDiscard(state, seat, opts);
    case 'PLAYING':
      return choosePlay(state, seat, opts);
    default:
      throw new Error(`strong bot inactive in phase ${state.phase}`);
  }
}
