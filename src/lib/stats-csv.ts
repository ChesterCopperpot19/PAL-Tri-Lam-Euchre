// Build a CSV of the leaderboard for export. Pure string-building.

import type { PlayerRow } from './stats-analytics';
import type { EloResult } from './stats-elo';

function cell(v: unknown): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function playersToCSV(players: PlayerRow[], elo: Map<string, EloResult>): string {
  const headers = [
    'Player', 'Elo', 'Games', 'Wins', 'Losses', 'Win%', 'PPG_For', 'PPG_Against', 'Point_Diff',
    'Tricks', 'Hands_Called', 'Calls_Won', 'Call%', 'Marches', 'Euchred', 'Loners_Called',
    'Loners_Won', 'Current_Streak', 'Longest_Win_Streak',
  ];
  const rows = players
    .slice()
    .sort((a, b) => (elo.get(b.name)?.rating ?? 0) - (elo.get(a.name)?.rating ?? 0))
    .map((p) => {
      const r = elo.get(p.name);
      return [
        p.name, r ? r.rating : '', p.games, p.wins, p.losses, (p.winPct * 100).toFixed(1),
        p.ppgFor.toFixed(2), p.ppgAgainst.toFixed(2), p.pointDiff.toFixed(2), p.tricks,
        p.handsCalled, p.callsWon, (p.callPct * 100).toFixed(1), p.marches, p.euchres,
        p.loneCalled, p.loneWon, p.currentStreak, p.longestWinStreak,
      ];
    });
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}
