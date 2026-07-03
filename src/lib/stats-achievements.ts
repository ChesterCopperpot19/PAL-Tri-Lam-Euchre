// Achievements / badges — fun + milestone. Each badge lists the players who've
// earned it (milestones can have many holders; "fun" ones are usually single).
//
// Earn dates: the match history is replayed chronologically and the first game
// after which a player met a badge's condition is recorded as its earn date.
// "Top Dog" tracks the *current* Elo leader, so it carries no date.

import type { MatchRecord } from './shared-types';
import { humanGames, type PlayerRow } from './stats-analytics';
import type { EloResult } from './stats-elo';

export type BadgeEarn = { name: string; ts: number | null };

export type Badge = {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  kind: 'milestone' | 'fun';
  /** Holder names (kept for convenience — same order as `earned`). */
  holders: string[];
  /** Holders with the date each first earned the badge (null = undated). */
  earned: BadgeEarn[];
};

/** Per-player running totals during the chronological replay. */
type Acc = {
  games: number;
  wins: number;
  marches: number;
  loneWon: number;
  loneCalled: number;
  handsCalled: number;
  callsWon: number;
  winRun: number;
  lossRun: number;
};

const BADGE_DEFS: Array<{
  id: string;
  emoji: string;
  name: string;
  desc: string;
  kind: Badge['kind'];
  earnedNow: (a: Acc) => boolean;
}> = [
  { id: 'first-win', emoji: '🥇', name: 'First Blood', desc: 'Won a game', kind: 'milestone', earnedNow: (a) => a.wins >= 1 },
  { id: 'veteran', emoji: '🎖️', name: 'Veteran', desc: '25+ games played', kind: 'milestone', earnedNow: (a) => a.games >= 25 },
  { id: 'centurion', emoji: '💯', name: 'Centurion', desc: '100+ games played', kind: 'milestone', earnedNow: (a) => a.games >= 100 },
  { id: 'sweeper', emoji: '🧹', name: 'Sweeper', desc: '10+ marches', kind: 'milestone', earnedNow: (a) => a.marches >= 10 },
  { id: 'lone-wolf', emoji: '🐺', name: 'Lone Wolf', desc: 'Made a loner', kind: 'milestone', earnedNow: (a) => a.loneWon >= 1 },
  { id: 'high-roller', emoji: '🎲', name: 'High Roller', desc: 'Called 10+ loners', kind: 'milestone', earnedNow: (a) => a.loneCalled >= 10 },
  {
    id: 'sharp',
    emoji: '🎯',
    name: 'Sharpshooter',
    desc: '60%+ call success over 10+ calls',
    kind: 'milestone',
    earnedNow: (a) => a.handsCalled >= 10 && a.callsWon / a.handsCalled >= 0.6,
  },
  { id: 'on-fire', emoji: '🔥', name: 'On Fire', desc: '5-game win streak', kind: 'milestone', earnedNow: (a) => a.winRun >= 5 },
  { id: 'iceman', emoji: '🧊', name: 'Iceman', desc: 'Survived a 5-game skid', kind: 'fun', earnedNow: (a) => a.lossRun >= 5 },
];

export function computeBadges(
  matches: MatchRecord[],
  players: PlayerRow[],
  elo: Map<string, EloResult>
): Badge[] {
  const games = humanGames(matches)
    .slice()
    .sort((a, b) => a.ts - b.ts);

  const acc = new Map<string, Acc>();
  // badge id → (player → ts first earned)
  const firstEarned = new Map<string, Map<string, number>>();
  for (const def of BADGE_DEFS) firstEarned.set(def.id, new Map());

  for (const m of games) {
    for (const p of m.players) {
      let a = acc.get(p.name);
      if (!a) {
        a = { games: 0, wins: 0, marches: 0, loneWon: 0, loneCalled: 0, handsCalled: 0, callsWon: 0, winRun: 0, lossRun: 0 };
        acc.set(p.name, a);
      }
      const win = p.team === m.winnerTeam;
      a.games += 1;
      a.wins += win ? 1 : 0;
      a.marches += p.marches;
      a.loneWon += p.loneWon;
      a.loneCalled += p.loneCalled;
      a.handsCalled += p.handsCalled;
      a.callsWon += p.callsWon;
      if (win) {
        a.winRun += 1;
        a.lossRun = 0;
      } else {
        a.lossRun += 1;
        a.winRun = 0;
      }
      for (const def of BADGE_DEFS) {
        const dates = firstEarned.get(def.id)!;
        if (!dates.has(p.name) && def.earnedNow(a)) dates.set(p.name, m.ts);
      }
    }
  }

  const badges: Badge[] = [];
  for (const def of BADGE_DEFS) {
    const dates = firstEarned.get(def.id)!;
    let earned: BadgeEarn[];
    if (def.id === 'sharp') {
      // Sharpshooter can be earned and later lost — holders = currently
      // qualifying; the date = when they first hit the mark.
      earned = players
        .filter((p) => p.handsCalled >= 10 && p.callPct >= 0.6)
        .map((p) => ({ name: p.name, ts: dates.get(p.name) ?? null }));
    } else {
      earned = [...dates.entries()].map(([name, ts]) => ({ name, ts }));
    }
    earned.sort((a, b) => (a.ts ?? Infinity) - (b.ts ?? Infinity));
    if (earned.length) {
      badges.push({
        id: def.id,
        emoji: def.emoji,
        name: def.name,
        desc: def.desc,
        kind: def.kind,
        holders: earned.map((e) => e.name),
        earned,
      });
    }
  }

  // ── Fun (single current holder, undated) ──
  const ranked = [...elo.values()].filter((r) => !r.provisional).sort((a, b) => b.rating - a.rating);
  if (ranked.length) {
    badges.push({
      id: 'top-dog',
      emoji: '👑',
      name: 'Top Dog',
      desc: 'Highest Elo rating',
      kind: 'fun',
      holders: [ranked[0].name],
      earned: [{ name: ranked[0].name, ts: null }],
    });
  }

  return badges;
}

/** Badges a single player currently holds (for their profile). */
export function badgesFor(name: string, badges: Badge[]): Badge[] {
  const n = name.trim();
  return badges.filter((b) => b.holders.includes(n));
}
