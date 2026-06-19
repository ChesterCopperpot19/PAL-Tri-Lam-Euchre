// Elo ratings over the (human) match history.
//
// Spec: everyone starts at 1500. Each game is a team event — the team's rating
// is the average of its two partners. After the game, each player on a team gets
// the SAME delta, K·(result − expected). K is 40 while a player is provisional
// (first 8 games) then 24. Pure win/loss (no margin). Games are processed in
// chronological order. Both partners share credit — a known team-Elo quirk we
// surface in the UI.

import type { MatchRecord } from './shared-types';
import { humanGames } from './stats-analytics';

const START = 1500;
const PROVISIONAL_GAMES = 8;
const K_PROVISIONAL = 40;
const K_SETTLED = 24;

export type EloPoint = { ts: number; rating: number };

export type EloResult = {
  name: string;
  rating: number;
  games: number;
  provisional: boolean;
  delta: number; // change from the player's previous game
  peak: number;
  history: EloPoint[]; // rating after each game, chronological
};

const norm = (s: string) => s.trim();

export function computeElo(matches: MatchRecord[]): Map<string, EloResult> {
  const games = humanGames(matches)
    .slice()
    .sort((a, b) => a.ts - b.ts);

  const rating = new Map<string, number>();
  const count = new Map<string, number>();
  const delta = new Map<string, number>();
  const peak = new Map<string, number>();
  const history = new Map<string, EloPoint[]>();
  const get = (n: string) => rating.get(n) ?? START;

  const apply = (name: string, expected: number, won: boolean, ts: number) => {
    const g = count.get(name) ?? 0;
    const k = g < PROVISIONAL_GAMES ? K_PROVISIONAL : K_SETTLED;
    const before = get(name);
    const after = before + k * ((won ? 1 : 0) - expected);
    rating.set(name, after);
    count.set(name, g + 1);
    delta.set(name, after - before);
    peak.set(name, Math.max(peak.get(name) ?? after, after));
    const h = history.get(name) ?? [];
    h.push({ ts, rating: Math.round(after) });
    history.set(name, h);
  };

  for (const m of games) {
    const ns = m.players.filter((p) => p.team === 'NS').map((p) => norm(p.name));
    const ew = m.players.filter((p) => p.team === 'EW').map((p) => norm(p.name));
    if (ns.length !== 2 || ew.length !== 2) continue;
    const nsAvg = (get(ns[0]) + get(ns[1])) / 2;
    const ewAvg = (get(ew[0]) + get(ew[1])) / 2;
    const expNS = 1 / (1 + 10 ** ((ewAvg - nsAvg) / 400));
    const expEW = 1 - expNS;
    const nsWon = m.winnerTeam === 'NS';
    apply(ns[0], expNS, nsWon, m.ts);
    apply(ns[1], expNS, nsWon, m.ts);
    apply(ew[0], expEW, !nsWon, m.ts);
    apply(ew[1], expEW, !nsWon, m.ts);
  }

  const out = new Map<string, EloResult>();
  for (const [name, r] of rating) {
    const g = count.get(name) ?? 0;
    out.set(name, {
      name,
      rating: Math.round(r),
      games: g,
      provisional: g < PROVISIONAL_GAMES,
      delta: Math.round(delta.get(name) ?? 0),
      peak: Math.round(peak.get(name) ?? r),
      history: history.get(name) ?? [],
    });
  }
  return out;
}

/**
 * Most-improved: Elo gained over a player's last `window` games (vs. their
 * rating before that window, or 1500 if they have fewer games). Requires
 * `minGames` so it isn't noise. Returns the biggest gainer, or null.
 */
export function mostImproved(
  elo: Map<string, EloResult>,
  window = 8,
  minGames = 6
): { name: string; gain: number } | null {
  let best: { name: string; gain: number } | null = null;
  for (const r of elo.values()) {
    if (r.games < minGames) continue;
    const h = r.history;
    const past = h.length > window ? h[h.length - 1 - window].rating : START;
    const gain = Math.round(r.rating - past);
    if (!best || gain > best.gain) best = { name: r.name, gain };
  }
  return best;
}
