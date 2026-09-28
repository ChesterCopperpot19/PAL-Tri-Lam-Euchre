// Per-player decision quality: every card decision graded on what the player
// could see (fair.ts), plus the hindsight verdict (analyze.ts) so we can tell
// real mistakes from bad luck. Pure: the grading runs in Web Workers, this module
// shapes and aggregates the results.

import type { HandSummary } from '@/server/engine/types';
import { analyzeHand } from './analyze';
import { fairGrades } from './fair';

/** Deals sampled per decision for profile stats: averages over hundreds of
 *  decisions tolerate more noise per decision than a single replay verdict. */
export const PROFILE_SAMPLES = 100;
/** Bump when grading changes, so cached results are recomputed. */
export const DECISIONS_VERSION = 1;

/** One card played, compactly. Forced cards (one legal option) have g = null. */
export type Decision = {
  /** Seat, 0-based trick, and the card played. */
  s: number;
  t: number;
  c: string;
  /** Maker's side? */
  m: boolean;
  /** Tricks given away with every card visible. */
  h: number;
  /** Expected points given up versus the best card, on what they could see. */
  f: number | null;
  /** Fair grade: Sound, Close call, Mistake; null when forced. */
  g: 'S' | 'C' | 'M' | null;
  /** The best card on what they could see (when not the one played). */
  b: string | null;
};

/** Grade one hand (null when it has no usable card record). */
export function gradeHandDecisions(h: HandSummary, samples = PROFILE_SAMPLES): Decision[] | null {
  const a = analyzeHand(h);
  const f = a && fairGrades(h, samples);
  if (!a || !f) return null;
  return a.plays.map((p, i) => {
    const v = f[i];
    return {
      s: p.seat,
      t: p.trick,
      c: p.card.id,
      m: p.maker,
      h: p.cost,
      f: v ? Math.round(v.cost * 1000) / 1000 : null,
      g: v ? (v.grade === 'sound' ? 'S' : v.grade === 'close' ? 'C' : 'M') : null,
      b: v && v.best.id !== p.card.id ? v.best.id : null,
    };
  });
}

export type DecisionStats = {
  /** Card decisions with a real choice (forced cards excluded). */
  decisions: number;
  sound: number;
  close: number;
  mistakes: number;
  /** Expected points given up, summed over decisions. */
  pointsLost: number;
  /** Sum of squared per-decision losses (for a confidence range on the mean). */
  pointsLostSq: number;
  /** Plays that gave away a trick in hindsight but were sound: bad luck. */
  unlucky: number;
  /** Plays that gave away a trick in hindsight. */
  hindsightMisplays: number;
  byRole: { maker: RoleStats; defender: RoleStats };
};
type RoleStats = { decisions: number; mistakes: number; pointsLost: number };

export type MistakeRef = { gameId: string; hand: number; step: number; d: Decision };

/** Where each game's hands came from, and which seats to count. */
export type GradedGame = { gameId: string; hands: (Decision[] | null)[]; seats: number[] };

const emptyRole = (): RoleStats => ({ decisions: 0, mistakes: 0, pointsLost: 0 });

/** Aggregate the decisions made from `seats` in each game. */
export function aggregate(games: GradedGame[]): { stats: DecisionStats; mistakes: MistakeRef[] } {
  const st: DecisionStats = {
    decisions: 0,
    sound: 0,
    close: 0,
    mistakes: 0,
    pointsLost: 0,
    pointsLostSq: 0,
    unlucky: 0,
    hindsightMisplays: 0,
    byRole: { maker: emptyRole(), defender: emptyRole() },
  };
  const mistakes: MistakeRef[] = [];
  for (const g of games)
    g.hands.forEach((hand, hi) =>
      hand?.forEach((d, pi) => {
        if (!g.seats.includes(d.s)) return;
        if (d.h > 0) {
          st.hindsightMisplays++;
          if (d.g === 'S' || d.g === null) st.unlucky++;
        }
        if (d.g === null) return;
        const role = d.m ? st.byRole.maker : st.byRole.defender;
        st.decisions++;
        role.decisions++;
        st.pointsLost += d.f!;
        st.pointsLostSq += d.f! * d.f!;
        role.pointsLost += d.f!;
        if (d.g === 'S') st.sound++;
        else if (d.g === 'C') st.close++;
        else {
          st.mistakes++;
          role.mistakes++;
          mistakes.push({ gameId: g.gameId, hand: hi + 1, step: pi + 1, d });
        }
      }),
    );
  mistakes.sort((x, y) => y.d.f! - x.d.f!);
  return { stats: st, mistakes };
}

/** Points lost per 100 decisions, with a ~95% range (normal approximation). */
export function pointsLostPer100(st: DecisionStats): { mean: number; lo: number; hi: number } {
  const n = st.decisions;
  if (!n) return { mean: 0, lo: 0, hi: 0 };
  const m = st.pointsLost / n;
  const variance = Math.max(0, st.pointsLostSq / n - m * m);
  const half = n > 1 ? 1.96 * Math.sqrt(variance / (n - 1)) : 0;
  return { mean: 100 * m, lo: 100 * Math.max(0, m - half), hi: 100 * (m + half) };
}
