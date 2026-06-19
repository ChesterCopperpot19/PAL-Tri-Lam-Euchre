// Achievements / badges — fun + milestone. Each badge lists the players who've
// earned it (milestones can have many holders; "fun" ones are usually single).

import type { PlayerRow } from './stats-analytics';
import type { EloResult } from './stats-elo';

export type Badge = {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  kind: 'milestone' | 'fun';
  holders: string[];
};

export function computeBadges(players: PlayerRow[], elo: Map<string, EloResult>): Badge[] {
  const badges: Badge[] = [];
  const add = (
    id: string,
    emoji: string,
    name: string,
    desc: string,
    kind: Badge['kind'],
    holders: string[]
  ) => {
    if (holders.length) badges.push({ id, emoji, name, desc, kind, holders });
  };
  const names = (filter: (p: PlayerRow) => boolean) => players.filter(filter).map((p) => p.name);

  // ── Milestones (everyone who crosses the bar earns it) ──
  add('first-win', '🥇', 'First Blood', 'Won a game', 'milestone', names((p) => p.wins >= 1));
  add('veteran', '🎖️', 'Veteran', '25+ games played', 'milestone', names((p) => p.games >= 25));
  add('centurion', '💯', 'Centurion', '100+ games played', 'milestone', names((p) => p.games >= 100));
  add('sweeper', '🧹', 'Sweeper', '10+ marches', 'milestone', names((p) => p.marches >= 10));
  add('lone-wolf', '🐺', 'Lone Wolf', 'Made a loner', 'milestone', names((p) => p.loneWon >= 1));
  add('high-roller', '🎲', 'High Roller', 'Called 10+ loners', 'milestone', names((p) => p.loneCalled >= 10));
  add(
    'sharp',
    '🎯',
    'Sharpshooter',
    '60%+ call success over 10+ calls',
    'milestone',
    names((p) => p.handsCalled >= 10 && p.callPct >= 0.6)
  );
  add('on-fire', '🔥', 'On Fire', '5-game win streak', 'milestone', names((p) => p.longestWinStreak >= 5));
  add('iceman', '🧊', 'Iceman', 'Survived a 5-game skid', 'fun', names((p) => p.longestLossStreak >= 5));

  // ── Fun (usually a single current holder) ──
  const ranked = [...elo.values()].filter((r) => !r.provisional).sort((a, b) => b.rating - a.rating);
  if (ranked.length) add('top-dog', '👑', 'Top Dog', 'Highest Elo rating', 'fun', [ranked[0].name]);

  const hot = players.slice().sort((a, b) => b.currentStreak - a.currentStreak)[0];
  if (hot && hot.currentStreak >= 3) {
    add('hot-hand', '♨️', 'Hot Hand', `Riding a ${hot.currentStreak}-game win streak`, 'fun', [hot.name]);
  }

  return badges;
}

/** Badges a single player currently holds (for their profile). */
export function badgesFor(name: string, badges: Badge[]): Badge[] {
  const n = name.trim();
  return badges.filter((b) => b.holders.includes(n));
}
