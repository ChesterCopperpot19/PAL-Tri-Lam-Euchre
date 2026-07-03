// Game-night "sessions" — clusters of games played in one sitting. Pure
// functions over the match history so recaps and the games archive can share
// the grouping logic.
//
// A session = consecutive (chronological) human games where the gap between one
// game ending and the next ending is ≤ GAP_MS. Six hours comfortably spans a
// dinner break and a past-midnight finish without merging separate nights.

import type { MatchRecord } from './shared-types';
import { humanGames } from './stats-analytics';

const GAP_MS = 6 * 60 * 60 * 1000;

export type SessionPlayerRecord = {
  name: string;
  games: number;
  wins: number;
  losses: number;
};

export type Session = {
  /** Stable id — ts of the first game. */
  id: string;
  startTs: number; // start of first game (startedTs when known, else ts)
  endTs: number; // ts of last game
  games: MatchRecord[]; // chronological
  handsTotal: number;
  /** Sum of known per-game durations (ms); null when no game recorded a start time. */
  durationMs: number | null;
  /** Longest single game of the night (ms), with its match. */
  longestGame: { match: MatchRecord; durationMs: number } | null;
  /** Per-player W-L for the session, best record first. */
  records: SessionPlayerRecord[];
  /** Player(s) with the best record (most wins, fewest losses). */
  champions: string[];
  /** The night's most lopsided final score. */
  biggestWin: { match: MatchRecord; margin: number } | null;
};

/** Duration of one game in ms, or null when the start time is missing/bogus. */
export function gameDurationMs(m: MatchRecord): number | null {
  if (!m.startedTs || m.startedTs >= m.ts) return null;
  return m.ts - m.startedTs;
}

/** Group the human games into sessions, oldest → newest. */
export function computeSessions(matches: MatchRecord[], gapMs: number = GAP_MS): Session[] {
  const games = humanGames(matches)
    .slice()
    .sort((a, b) => a.ts - b.ts);
  const groups: MatchRecord[][] = [];
  for (const m of games) {
    const cur = groups[groups.length - 1];
    if (cur && m.ts - cur[cur.length - 1].ts <= gapMs) cur.push(m);
    else groups.push([m]);
  }
  return groups.map(buildSession);
}

function buildSession(games: MatchRecord[]): Session {
  const recs = new Map<string, SessionPlayerRecord>();
  let handsTotal = 0;
  let durationMs: number | null = null;
  let longestGame: Session['longestGame'] = null;
  let biggestWin: Session['biggestWin'] = null;

  for (const m of games) {
    handsTotal += m.handsPlayed;
    const d = gameDurationMs(m);
    if (d != null) {
      durationMs = (durationMs ?? 0) + d;
      if (!longestGame || d > longestGame.durationMs) longestGame = { match: m, durationMs: d };
    }
    const margin = Math.abs(m.finalScore.NS - m.finalScore.EW);
    if (!biggestWin || margin > biggestWin.margin) biggestWin = { match: m, margin };
    for (const p of m.players) {
      const r = recs.get(p.name) ?? { name: p.name, games: 0, wins: 0, losses: 0 };
      const win = p.team === m.winnerTeam;
      r.games += 1;
      r.wins += win ? 1 : 0;
      r.losses += win ? 0 : 1;
      recs.set(p.name, r);
    }
  }

  const records = [...recs.values()].sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name)
  );
  const best = records[0];
  const champions = best
    ? records.filter((r) => r.wins === best.wins && r.losses === best.losses).map((r) => r.name)
    : [];

  const first = games[0];
  return {
    id: String(first.ts),
    startTs: first.startedTs && first.startedTs < first.ts ? first.startedTs : first.ts,
    endTs: games[games.length - 1].ts,
    games,
    handsTotal,
    durationMs,
    longestGame,
    records,
    champions,
    biggestWin,
  };
}

/** "2h 15m" / "45m" for a session or game duration. */
export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
