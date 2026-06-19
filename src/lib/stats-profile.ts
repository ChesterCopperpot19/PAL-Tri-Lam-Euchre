// Per-player profile bundle + radar metrics. Pure; derived from match history.

import type { MatchRecord } from './shared-types';
import { humanGames, type PlayerRow } from './stats-analytics';

const norm = (s: string) => s.trim();

// ── Radar ────────────────────────────────────────────────────────────────────

export type RadarAxes = {
  maker: number; // call success rate
  defense: number; // defensive tricks / game
  loner: number; // loner make rate
  consistency: number; // steadiness (derived from margin spread)
  aggression: number; // calls + loners per game
};

const RADAR_KEYS: (keyof RadarAxes)[] = ['maker', 'defense', 'loner', 'consistency', 'aggression'];

function rawAxes(p: PlayerRow): RadarAxes {
  const g = p.games || 1;
  return {
    maker: p.handsCalled ? p.callsWon / p.handsCalled : 0,
    defense: p.defensiveTricks / g,
    loner: p.loneCalled ? p.loneWon / p.loneCalled : 0,
    consistency: p.marginStd, // lower is better → inverted when scaled
    aggression: (p.handsCalled + p.loneCalled) / g,
  };
}

/**
 * Radar values per player, scaled RELATIVE to the club (each axis min→max
 * mapped to 20..100 so the shape reads). `consistency` is inverted (a smaller
 * margin spread is more consistent). Raw values are kept for tooltips.
 */
export function computeRadar(players: PlayerRow[]): Map<string, { raw: RadarAxes; scaled: RadarAxes }> {
  const raws = players.map((p) => ({ name: p.name, raw: rawAxes(p) }));
  const lo: Record<string, number> = {};
  const hi: Record<string, number> = {};
  for (const ax of RADAR_KEYS) {
    const vals = raws.map((r) => r.raw[ax]);
    lo[ax] = Math.min(...vals);
    hi[ax] = Math.max(...vals);
  }
  const scale = (ax: keyof RadarAxes, v: number): number => {
    if (hi[ax] === lo[ax]) return 60; // everyone equal → neutral middle
    let t = (v - lo[ax]) / (hi[ax] - lo[ax]); // 0..1
    if (ax === 'consistency') t = 1 - t; // lower spread = more consistent
    return Math.round(20 + t * 80);
  };
  const out = new Map<string, { raw: RadarAxes; scaled: RadarAxes }>();
  for (const r of raws) {
    const scaled = {} as RadarAxes;
    for (const ax of RADAR_KEYS) scaled[ax] = scale(ax, r.raw[ax]);
    out.set(r.name, { raw: r.raw, scaled });
  }
  return out;
}

// ── Profile ──────────────────────────────────────────────────────────────────

export type PartnerSplit = {
  name: string;
  games: number;
  wins: number;
  losses: number;
  winPct: number;
  ppgFor: number;
};
export type OpponentSplit = { name: string; games: number; wins: number; losses: number; winPct: number };
export type TrendPoint = { ts: number; game: number; cumulativeDiff: number; cumulativeWins: number };
export type ActivityDay = { day: string; games: number; wins: number };

export type PlayerProfile = {
  name: string;
  exists: boolean;
  games: number;
  wins: number;
  losses: number;
  winPct: number;
  partners: PartnerSplit[];
  opponents: OpponentSplit[];
  trend: TrendPoint[];
  rollingForm: boolean[]; // chronological win/loss
  activity: ActivityDay[];
};

export function computeProfile(name: string, matches: MatchRecord[]): PlayerProfile {
  const target = norm(name);
  const games = humanGames(matches)
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .filter((m) => m.players.some((p) => norm(p.name) === target));

  const partners = new Map<string, { games: number; wins: number; losses: number; pf: number }>();
  const opps = new Map<string, { games: number; wins: number; losses: number }>();
  const activity = new Map<string, { games: number; wins: number }>();
  const trend: TrendPoint[] = [];
  const rollingForm: boolean[] = [];
  let wins = 0;
  let losses = 0;
  let cumDiff = 0;
  let cumWins = 0;

  games.forEach((m, idx) => {
    const me = m.players.find((p) => norm(p.name) === target)!;
    const win = me.team === m.winnerTeam;
    const myScore = m.finalScore[me.team];
    const oppScore = m.finalScore[me.team === 'NS' ? 'EW' : 'NS'];
    wins += win ? 1 : 0;
    losses += win ? 0 : 1;

    const partner = m.players.find((p) => p.team === me.team && norm(p.name) !== target);
    if (partner) {
      const k = norm(partner.name);
      const a = partners.get(k) ?? { games: 0, wins: 0, losses: 0, pf: 0 };
      a.games += 1;
      a.wins += win ? 1 : 0;
      a.losses += win ? 0 : 1;
      a.pf += myScore;
      partners.set(k, a);
    }
    for (const o of m.players.filter((p) => p.team !== me.team)) {
      const k = norm(o.name);
      const a = opps.get(k) ?? { games: 0, wins: 0, losses: 0 };
      a.games += 1;
      a.wins += win ? 1 : 0;
      a.losses += win ? 0 : 1;
      opps.set(k, a);
    }

    cumDiff += myScore - oppScore;
    cumWins += win ? 1 : -1;
    trend.push({ ts: m.ts, game: idx + 1, cumulativeDiff: cumDiff, cumulativeWins: cumWins });
    rollingForm.push(win);

    const day = new Date(m.ts).toISOString().slice(0, 10);
    const av = activity.get(day) ?? { games: 0, wins: 0 };
    av.games += 1;
    av.wins += win ? 1 : 0;
    activity.set(day, av);
  });

  const partnerArr: PartnerSplit[] = [...partners]
    .map(([n, a]) => ({
      name: n,
      games: a.games,
      wins: a.wins,
      losses: a.losses,
      winPct: a.games ? a.wins / a.games : 0,
      ppgFor: a.games ? a.pf / a.games : 0,
    }))
    .sort((x, y) => y.games - x.games || y.winPct - x.winPct);

  const oppArr: OpponentSplit[] = [...opps]
    .map(([n, a]) => ({
      name: n,
      games: a.games,
      wins: a.wins,
      losses: a.losses,
      winPct: a.games ? a.wins / a.games : 0,
    }))
    .sort((x, y) => y.games - x.games);

  const activityArr: ActivityDay[] = [...activity]
    .map(([day, a]) => ({ day, games: a.games, wins: a.wins }))
    .sort((x, y) => x.day.localeCompare(y.day));

  return {
    name: target,
    exists: games.length > 0,
    games: games.length,
    wins,
    losses,
    winPct: games.length ? wins / games.length : 0,
    partners: partnerArr,
    opponents: oppArr,
    trend,
    rollingForm,
    activity: activityArr,
  };
}
