// Picks a session's costliest play and best play from double-dummy analyses.
// Hindsight, like every verdict here: "with every card visible".

import type { HandAnalysis, PlayVerdict } from './analyze';

export type PlayRef = {
  gameId: string;
  /** 1-based game number within the session, and hand number within the game. */
  gameNo: number;
  handNo: number;
  /** Cards played up to and including this one, for a replay ?card= link. */
  step: number;
  play: PlayVerdict;
};

export type Costliest = PlayRef & { flipped: boolean };
export type Best = PlayRef & {
  /** Every other legal card would have given away at least this many tricks. */
  margin: number;
};

type GameAnalyses = { gameId: string; analyses: (HandAnalysis | null)[] };

/** Tricks each other legal card would have given away versus the one played. */
function losses(p: PlayVerdict): number[] {
  const played = p.options.find((o) => o.card.id === p.card.id)!.value;
  return p.options
    .filter((o) => o.card.id !== p.card.id)
    .map((o) => (p.maker ? played - o.value : o.value - played));
}

export function sessionHighlights(games: GameAnalyses[]): { costliest: Costliest | null; best: Best | null } {
  let costliest: Costliest | null = null;
  let best: Best | null = null;
  let bestSpread = 0;
  games.forEach((g, gi) =>
    g.analyses.forEach((a, hi) => {
      if (!a) return;
      a.plays.forEach((play, pi) => {
        const ref = { gameId: g.gameId, gameNo: gi + 1, handNo: hi + 1, step: pi + 1, play };
        // Costliest: most tricks given away; a play that flipped who scored wins
        // ties; later in the night wins remaining ties.
        if (
          play.cost > 0 &&
          (!costliest ||
            play.cost > costliest.play.cost ||
            (play.cost === costliest.play.cost && (a.decidedByMisplay || !costliest.flipped)))
        )
          costliest = { ...ref, flipped: a.decidedByMisplay };
        // Best: a best play where every alternative gave something away. Ranked by
        // the smallest such loss (the margin), then by the total at stake.
        if (play.cost === 0 && play.options.length > 1) {
          const l = losses(play);
          const margin = Math.min(...l);
          const spread = l.reduce((s, x) => s + x, 0);
          if (margin > 0 && (!best || margin > best.margin || (margin === best.margin && spread >= bestSpread))) {
            best = { ...ref, margin };
            bestSpread = spread;
          }
        }
      });
    }),
  );
  return { costliest, best };
}
