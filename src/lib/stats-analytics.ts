// ─────────────────────────────────────────────────────────────────────────────
// Stats analytics — pure functions over the recorded match history.
//
// Everything the Analytics Dashboard shows is *derived* from MatchRecord[]; we
// store no aggregates. Each MatchRecord contains all four seats with their team
// (NS/EW) and the winning team, so individual records, partnerships (same team),
// head-to-head (opposing teams), and streaks (via timestamps) are all derivable.
//
// House rule for this dashboard: ONLY fully-human games count. We drop any game
// that had a bot in any seat before computing a single metric, so the numbers
// reflect real people playing each other.
//
// These functions are intentionally free of React/DOM so they can be unit-tested
// in isolation (see scripts/stats-analytics-check.ts) and memoized on the client.
// ─────────────────────────────────────────────────────────────────────────────

import type { MatchRecord, PlayerMatchStat } from './shared-types';

// ── Output shapes ────────────────────────────────────────────────────────────

/** One row of the individual leaderboard. winPct/callPct are fractions (0..1). */
export type PlayerRow = {
  name: string;
  games: number;
  wins: number;
  losses: number;
  winPct: number;
  tricks: number;
  defensiveTricks: number;
  defensiveEuchres: number; // euchres inflicted on opponents while defending
  handsCalled: number;
  callsWon: number;
  callPct: number;
  euchres: number; // times set (euchred) while calling
  marches: number; // 5-trick sweeps while calling
  loneCalled: number;
  loneWon: number;
  /** Current streak: +n = winning n in a row, -n = losing n in a row, 0 = none. */
  currentStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
  lastPlayed: number; // ts of most recent game
  ppgFor: number; // avg points scored per game (0..10)
  ppgAgainst: number; // avg points conceded per game
  pointDiff: number; // ppgFor - ppgAgainst
  marginStd: number; // std-dev of per-game point margin (lower = more consistent)
};

/** A two-human partnership (players who shared a team in a game). */
export type DuoRow = {
  a: string;
  b: string;
  key: string; // `${a}|${b}` with a<b — stable id
  games: number;
  wins: number;
  losses: number;
  winPct: number;
};

/** Head-to-head record between two humans who sat on opposing teams. */
export type H2HRow = {
  a: string; // a < b alphabetically
  b: string;
  key: string;
  games: number;
  aWins: number; // games where a's team beat b's team
  bWins: number;
};

/** A narrative "superlative" award card. */
export type Superlative = {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  player: string | null; // null → not enough data to award
  value: string;
  sub?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const norm = (name: string) => name.trim();

/** Keep only games where every one of the four seats was a human. */
export function humanGames(matches: MatchRecord[]): MatchRecord[] {
  return matches.filter(
    (m) => m.players.length === 4 && m.players.every((p) => !p.isBot && norm(p.name).length > 0)
  );
}

/** Oldest → newest. Streak math depends on chronological order. */
function chronological(matches: MatchRecord[]): MatchRecord[] {
  return matches.slice().sort((a, b) => a.ts - b.ts);
}

const playerWon = (p: PlayerMatchStat, m: MatchRecord) => p.team === m.winnerTeam;

/** Unordered pair key, alphabetical, so (A,B) and (B,A) collapse to one bucket. */
function pairKey(x: string, y: string): { a: string; b: string; key: string } {
  const [a, b] = x <= y ? [x, y] : [y, x];
  return { a, b, key: `${a}|${b}` };
}

// ── Individual leaderboard ───────────────────────────────────────────────────

export function computePlayers(matches: MatchRecord[]): PlayerRow[] {
  const games = chronological(humanGames(matches));

  type Acc = Omit<
    PlayerRow,
    | 'winPct'
    | 'callPct'
    | 'currentStreak'
    | 'longestWinStreak'
    | 'longestLossStreak'
    | 'ppgFor'
    | 'ppgAgainst'
    | 'pointDiff'
    | 'marginStd'
  > & { results: boolean[]; pointsFor: number; pointsAgainst: number; margins: number[] };
  const map = new Map<string, Acc>();

  const ensure = (name: string): Acc => {
    let a = map.get(name);
    if (!a) {
      a = {
        name,
        games: 0,
        wins: 0,
        losses: 0,
        tricks: 0,
        defensiveTricks: 0,
        defensiveEuchres: 0,
        handsCalled: 0,
        callsWon: 0,
        euchres: 0,
        marches: 0,
        loneCalled: 0,
        loneWon: 0,
        lastPlayed: 0,
        results: [],
        pointsFor: 0,
        pointsAgainst: 0,
        margins: [],
      };
      map.set(name, a);
    }
    return a;
  };

  for (const m of games) {
    for (const p of m.players) {
      const a = ensure(norm(p.name));
      const win = playerWon(p, m);
      const myScore = m.finalScore[p.team];
      const oppScore = m.finalScore[p.team === 'NS' ? 'EW' : 'NS'];
      a.games += 1;
      a.wins += win ? 1 : 0;
      a.losses += win ? 0 : 1;
      a.tricks += p.tricks;
      a.defensiveTricks += p.defensiveTricks;
      a.defensiveEuchres += p.defensiveEuchres ?? 0;
      a.handsCalled += p.handsCalled;
      a.callsWon += p.callsWon;
      a.euchres += p.euchres;
      a.marches += p.marches;
      a.loneCalled += p.loneCalled;
      a.loneWon += p.loneWon;
      a.lastPlayed = Math.max(a.lastPlayed, m.ts);
      a.results.push(win);
      a.pointsFor += myScore;
      a.pointsAgainst += oppScore;
      a.margins.push(myScore - oppScore);
    }
  }

  return Array.from(map.values()).map((a) => {
    const { results, pointsFor, pointsAgainst, margins, ...rest } = a;
    const g = a.games || 1;
    return {
      ...rest,
      winPct: a.games ? a.wins / a.games : 0,
      callPct: a.handsCalled ? a.callsWon / a.handsCalled : 0,
      ppgFor: pointsFor / g,
      ppgAgainst: pointsAgainst / g,
      pointDiff: (pointsFor - pointsAgainst) / g,
      marginStd: stdev(margins),
      ...streaks(results),
    };
  });
}

/** Population standard deviation; 0 for fewer than two samples. */
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/** Current + longest win/loss streaks from a chronological win/loss list. */
function streaks(results: boolean[]): {
  currentStreak: number;
  longestWinStreak: number;
  longestLossStreak: number;
} {
  let longestWin = 0;
  let longestLoss = 0;
  let runWin = 0;
  let runLoss = 0;
  for (const win of results) {
    if (win) {
      runWin += 1;
      runLoss = 0;
    } else {
      runLoss += 1;
      runWin = 0;
    }
    longestWin = Math.max(longestWin, runWin);
    longestLoss = Math.max(longestLoss, runLoss);
  }
  // The trailing run is the current streak: positive if it ends on wins.
  let current = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (i === results.length - 1) current = results[i] ? 1 : -1;
    else if (results[i] === results[results.length - 1]) current += results[i] ? 1 : -1;
    else break;
  }
  return { currentStreak: current, longestWinStreak: longestWin, longestLossStreak: longestLoss };
}

// ── Partnerships (Dynamic Duos) ──────────────────────────────────────────────

export function computeDuos(matches: MatchRecord[]): DuoRow[] {
  const games = humanGames(matches);
  const map = new Map<string, DuoRow>();

  const add = (x: string, y: string, won: boolean) => {
    const { a, b, key } = pairKey(norm(x), norm(y));
    let row = map.get(key);
    if (!row) {
      row = { a, b, key, games: 0, wins: 0, losses: 0, winPct: 0 };
      map.set(key, row);
    }
    row.games += 1;
    row.wins += won ? 1 : 0;
    row.losses += won ? 0 : 1;
  };

  for (const m of games) {
    const ns = m.players.filter((p) => p.team === 'NS');
    const ew = m.players.filter((p) => p.team === 'EW');
    if (ns.length === 2) add(ns[0].name, ns[1].name, m.winnerTeam === 'NS');
    if (ew.length === 2) add(ew[0].name, ew[1].name, m.winnerTeam === 'EW');
  }

  for (const row of map.values()) row.winPct = row.games ? row.wins / row.games : 0;
  return Array.from(map.values());
}

/** Lookup of duo win% by unordered pair key — handy for the partnership matrix. */
export function duoLookup(duos: DuoRow[]): Map<string, DuoRow> {
  return new Map(duos.map((d) => [d.key, d]));
}

// ── Head-to-head (Frenemies) ─────────────────────────────────────────────────

export function computeHeadToHead(matches: MatchRecord[]): H2HRow[] {
  const games = humanGames(matches);
  const map = new Map<string, H2HRow>();

  for (const m of games) {
    const ns = m.players.filter((p) => p.team === 'NS').map((p) => norm(p.name));
    const ew = m.players.filter((p) => p.team === 'EW').map((p) => norm(p.name));
    const nsWon = m.winnerTeam === 'NS';
    // Every NS player faced every EW player this game (2×2 = 4 rivalries).
    for (const x of ns) {
      for (const y of ew) {
        const { a, b, key } = pairKey(x, y);
        let row = map.get(key);
        if (!row) {
          row = { a, b, key, games: 0, aWins: 0, bWins: 0 };
          map.set(key, row);
        }
        row.games += 1;
        // x is the NS player, y the EW player → the winner is on the winning team.
        const winnerName = nsWon ? x : y;
        if (winnerName === a) row.aWins += 1;
        else row.bWins += 1;
      }
    }
  }
  return Array.from(map.values());
}

// ── Superlatives (the narrative layer) ───────────────────────────────────────

/**
 * Award cards. `minGames` gates the efficiency-based awards so a 1-for-1 guest
 * can't take "best win %". Returns one entry per award; `player: null` when there
 * isn't enough data yet (the UI renders those as "—, not enough games").
 */
export function computeSuperlatives(
  players: PlayerRow[],
  minGames: number
): Superlative[] {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const qualified = players.filter((p) => p.games >= minGames);

  const top = <T,>(rows: T[], score: (t: T) => number): T | null => {
    let best: T | null = null;
    let bestScore = -Infinity;
    for (const r of rows) {
      const s = score(r);
      if (s > bestScore) {
        best = r;
        bestScore = s;
      }
    }
    return best;
  };

  const anchor = top(qualified, (p) => p.winPct + p.games / 1e6); // win% then games
  const workhorse = top(players, (p) => p.games);
  const hot = top(players, (p) => p.currentStreak); // most positive
  const cold = top(players, (p) => -p.currentStreak); // most negative
  const sharp = top(
    players.filter((p) => p.handsCalled >= Math.max(3, minGames)),
    (p) => p.callPct
  );
  const gambler = top(players, (p) => p.loneCalled);
  const sweeper = top(players, (p) => p.marches);

  return [
    {
      id: 'anchor',
      emoji: '⚓',
      title: 'The Anchor',
      blurb: `Best win % (min ${minGames} games)`,
      player: anchor && anchor.games >= minGames ? anchor.name : null,
      value: anchor ? pct(anchor.winPct) : '—',
      sub: anchor ? `${anchor.wins}–${anchor.losses} over ${anchor.games} games` : undefined,
    },
    {
      id: 'workhorse',
      emoji: '🐴',
      title: 'The Workhorse',
      blurb: 'Most games played',
      player: workhorse && workhorse.games > 0 ? workhorse.name : null,
      value: workhorse && workhorse.games > 0 ? `${workhorse.games}` : '—',
      sub: workhorse && workhorse.games > 0 ? 'games played' : undefined,
    },
    {
      id: 'hot',
      emoji: '🔥',
      title: 'Hot Hand',
      blurb: 'Longest active win streak',
      player: hot && hot.currentStreak >= 2 ? hot.name : null,
      value: hot && hot.currentStreak >= 2 ? `${hot.currentStreak}W` : '—',
      sub: hot && hot.currentStreak >= 2 ? 'in a row' : undefined,
    },
    {
      id: 'cold',
      emoji: '🧊',
      title: 'Due for a Win',
      blurb: 'Longest active losing streak (it happens!)',
      player: cold && cold.currentStreak <= -2 ? cold.name : null,
      value: cold && cold.currentStreak <= -2 ? `${Math.abs(cold.currentStreak)}L` : '—',
      sub: cold && cold.currentStreak <= -2 ? 'in a row' : undefined,
    },
    {
      id: 'sharp',
      emoji: '🎯',
      title: 'Sharpshooter',
      blurb: 'Best success rate when calling trump',
      player: sharp ? sharp.name : null,
      value: sharp ? pct(sharp.callPct) : '—',
      sub: sharp ? `${sharp.callsWon}/${sharp.handsCalled} calls made` : undefined,
    },
    {
      id: 'gambler',
      emoji: '🎲',
      title: 'The Gambler',
      blurb: 'Most loners called',
      player: gambler && gambler.loneCalled > 0 ? gambler.name : null,
      value: gambler && gambler.loneCalled > 0 ? `${gambler.loneCalled}` : '—',
      sub:
        gambler && gambler.loneCalled > 0
          ? `${gambler.loneWon} made it`
          : undefined,
    },
    {
      id: 'sweeper',
      emoji: '🧹',
      title: 'The Sweeper',
      blurb: 'Most marches (5-trick sweeps)',
      player: sweeper && sweeper.marches > 0 ? sweeper.name : null,
      value: sweeper && sweeper.marches > 0 ? `${sweeper.marches}` : '—',
      sub: sweeper && sweeper.marches > 0 ? 'marches' : undefined,
    },
  ];
}

// ── Sorting ──────────────────────────────────────────────────────────────────

export type SortKey = keyof Pick<
  PlayerRow,
  | 'name'
  | 'games'
  | 'wins'
  | 'losses'
  | 'winPct'
  | 'ppgFor'
  | 'ppgAgainst'
  | 'pointDiff'
  | 'tricks'
  | 'defensiveTricks'
  | 'defensiveEuchres'
  | 'handsCalled'
  | 'callsWon'
  | 'callPct'
  | 'marches'
  | 'euchres'
  | 'loneCalled'
  | 'loneWon'
  | 'longestWinStreak'
  | 'longestLossStreak'
  | 'currentStreak'
>;

// ── Filtering ────────────────────────────────────────────────────────────────

export type MatchFilter = {
  from?: number; // ts inclusive (epoch ms)
  to?: number; // ts inclusive
  source?: 'app' | 'manual' | 'historical';
};

/** Filter matches by date range and/or how they were recorded. */
export function filterMatches(matches: MatchRecord[], f: MatchFilter): MatchRecord[] {
  return matches.filter((m) => {
    if (f.from !== undefined && m.ts < f.from) return false;
    if (f.to !== undefined && m.ts > f.to) return false;
    if (f.source && (m.source ?? 'app') !== f.source) return false;
    return true;
  });
}

export function sortPlayers(rows: PlayerRow[], key: SortKey, dir: 'asc' | 'desc'): PlayerRow[] {
  const mult = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((x, y) => {
    const a = x[key];
    const b = y[key];
    if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b) * mult;
    // Numeric: primary by the chosen key, stable tiebreak by games then name.
    const d = ((a as number) - (b as number)) * mult;
    if (d !== 0) return d;
    if (y.games !== x.games) return y.games - x.games;
    return x.name.localeCompare(y.name);
  });
}
