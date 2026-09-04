// Clutch & comeback analytics — reconstructed from the per-hand point log.
//
// "Close game" needs only the final score (margin ≤ 2), so it covers every
// recorded game. Comebacks / blown leads replay hands[].pointsAwarded to find
// the biggest deficit the eventual winner faced, so they only cover games with
// a hand log (comeback fields are null for players with no logged games).

import type { MatchRecord } from './shared-types';
import { humanGames } from './stats-analytics';

/** Margin (≤) that counts as a close finish. */
export const CLOSE_MARGIN = 2;
/** Deficit (≥) that counts as a real comeback / blown lead. */
export const COMEBACK_DEFICIT = 5;

export type ClutchRow = {
  name: string;
  closeGames: number;
  closeWins: number;
  closeLosses: number;
  closeWinPct: number; // 0..1 (0 when no close games)
  loggedGames: number; // games with a hand log (comeback denominators)
  comebackWins: number | null; // won after trailing by ≥ COMEBACK_DEFICIT
  blownLeads: number | null; // lost after leading by ≥ COMEBACK_DEFICIT
  biggestComeback: number | null; // largest deficit overcome in a win
};

export type ComebackGame = {
  match: MatchRecord;
  team: 'NS' | 'EW'; // the team that came back (the winner)
  deficit: number;
  names: string[];
};

export type ClutchResult = {
  players: ClutchRow[];
  /** The largest comeback on record, club-wide. */
  biggestComeback: ComebackGame | null;
};

/** Max deficit the eventual winner faced at any point in the game, from the
 *  hand-by-hand point log. Null when the match has no hand log. */
export function winnerMaxDeficit(m: MatchRecord): number | null {
  if (!m.hands || m.hands.length === 0) return null;
  let ns = 0;
  let ew = 0;
  let maxDeficit = 0;
  for (const h of m.hands) {
    ns += h.pointsAwarded.NS ?? 0;
    ew += h.pointsAwarded.EW ?? 0;
    const deficit = m.winnerTeam === 'NS' ? ew - ns : ns - ew;
    if (deficit > maxDeficit) maxDeficit = deficit;
  }
  return maxDeficit;
}

export function computeClutch(matches: MatchRecord[]): ClutchResult {
  const games = humanGames(matches);
  const map = new Map<string, ClutchRow>();
  const ensure = (name: string): ClutchRow => {
    let r = map.get(name);
    if (!r) {
      r = {
        name,
        closeGames: 0,
        closeWins: 0,
        closeLosses: 0,
        closeWinPct: 0,
        loggedGames: 0,
        comebackWins: null,
        blownLeads: null,
        biggestComeback: null,
      };
      map.set(name, r);
    }
    return r;
  };

  let biggestComeback: ComebackGame | null = null;

  for (const m of games) {
    // Records missing a usable final score (e.g. a partial legacy import) can't
    // be judged close or not — they simply don't count toward close games.
    const fs = m.finalScore as MatchRecord['finalScore'] | undefined;
    const hasScore = !!fs && Number.isFinite(fs.NS) && Number.isFinite(fs.EW);
    const close = hasScore && Math.abs(fs.NS - fs.EW) <= CLOSE_MARGIN;
    const deficit = winnerMaxDeficit(m);

    if (deficit != null && deficit >= COMEBACK_DEFICIT) {
      const names = m.players.filter((p) => p.team === m.winnerTeam).map((p) => p.name);
      if (!biggestComeback || deficit > biggestComeback.deficit) {
        biggestComeback = { match: m, team: m.winnerTeam, deficit, names };
      }
    }

    for (const p of m.players) {
      const r = ensure(p.name);
      const win = p.team === m.winnerTeam;
      if (close) {
        r.closeGames += 1;
        r.closeWins += win ? 1 : 0;
        r.closeLosses += win ? 0 : 1;
      }
      if (deficit != null) {
        r.loggedGames += 1;
        r.comebackWins = r.comebackWins ?? 0;
        r.blownLeads = r.blownLeads ?? 0;
        if (deficit >= COMEBACK_DEFICIT) {
          if (win) {
            r.comebackWins += 1;
            if (r.biggestComeback == null || deficit > r.biggestComeback) {
              r.biggestComeback = deficit;
            }
          } else {
            // The loser led by `deficit` at some point — a blown lead.
            r.blownLeads += 1;
          }
        }
      }
    }
  }

  for (const r of map.values()) {
    r.closeWinPct = r.closeGames ? r.closeWins / r.closeGames : 0;
  }
  return { players: [...map.values()], biggestComeback };
}
