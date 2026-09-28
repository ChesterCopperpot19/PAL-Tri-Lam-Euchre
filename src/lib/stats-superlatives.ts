// The dashboard's superlative cards: the base set from stats-analytics plus the
// Elo-based (Most Improved, WFEPE) and clutch (Closer, Comeback, Heartbreaker)
// cards. Pure, so it can be tested and memoised by the page.

import { computeSuperlatives, type PlayerRow, type Superlative } from './stats-analytics';
import type { computeElo, mostImproved } from './stats-elo';
import type { computeClutch } from './stats-clutch';

export function dashboardSuperlatives(
  players: PlayerRow[],
  minGames: number,
  improved: ReturnType<typeof mostImproved>,
  lowestEloName: string | null,
  elo: ReturnType<typeof computeElo>,
  clutch: ReturnType<typeof computeClutch>,
): Superlative[] {
  const base = computeSuperlatives(players, minGames);
  const earned = improved && improved.gain > 0;
  const mi: Superlative = {
    id: 'improved',
    emoji: '📈',
    title: 'Most Improved',
    blurb: 'Biggest recent Elo gain',
    player: earned ? improved!.name : null,
    value: earned ? `+${improved!.gain}` : '—',
    sub: earned ? 'Elo over recent games' : undefined,
  };
  const wfepe: Superlative = {
    id: 'wfepe',
    emoji: '🌊', // rendered as a seahorse in the card
    title: 'WFEPE',
    blurb: 'Lowest Elo rating',
    player: lowestEloName,
    value: lowestEloName ? `${elo.get(lowestEloName)?.rating ?? '—'}` : '—',
    sub: lowestEloName ? 'lowest Elo' : undefined,
  };

  // ── Clutch cards (from the hand-by-hand score log) ──
  const closeQualified = clutch.players.filter((p) => p.closeGames >= 3);
  const closer = closeQualified.length
    ? closeQualified.reduce((best, p) =>
        p.closeWinPct > best.closeWinPct ||
        (p.closeWinPct === best.closeWinPct && p.closeGames > best.closeGames)
          ? p
          : best
      )
    : null;
  const closerCard: Superlative = {
    id: 'closer',
    emoji: '🔒',
    title: 'The Closer',
    blurb: 'Best record in close games (min 3, decided by ≤2)',
    player: closer ? closer.name : null,
    value: closer ? `${Math.round(closer.closeWinPct * 100)}%` : '—',
    sub: closer ? `${closer.closeWins}–${closer.closeLosses} in close games` : undefined,
  };

  const cb = clutch.biggestComeback;
  const comebackCard: Superlative = {
    id: 'comeback',
    emoji: '🚀',
    title: 'Comeback Kings',
    blurb: 'Biggest deficit ever overcome',
    player: cb ? cb.names[0] : null,
    players: cb ? cb.names : undefined,
    value: cb ? `down ${cb.deficit}` : '—',
    sub: cb
      ? `won ${cb.match.finalScore[cb.team]}–${
          cb.match.finalScore[cb.team === 'NS' ? 'EW' : 'NS']
        }`
      : undefined,
  };

  const heartbreak = clutch.players
    .filter((p) => (p.blownLeads ?? 0) > 0)
    .reduce<(typeof clutch.players)[number] | null>(
      (worst, p) => (!worst || (p.blownLeads ?? 0) > (worst.blownLeads ?? 0) ? p : worst),
      null
    );
  const heartbreakCard: Superlative = {
    id: 'heartbreaker',
    emoji: '💔',
    title: 'The Heartbreaker',
    blurb: 'Most 5+ point leads lost',
    player: heartbreak ? heartbreak.name : null,
    value: heartbreak ? `${heartbreak.blownLeads}` : '—',
    sub: heartbreak ? 'blown 5+ point leads' : undefined,
  };

  return [mi, wfepe, closerCard, comebackCard, heartbreakCard, ...base];
}
