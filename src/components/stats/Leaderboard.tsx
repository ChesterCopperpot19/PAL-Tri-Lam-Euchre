'use client';
import Link from 'next/link';
import type { PlayerRow, SortKey } from '@/lib/stats-analytics';

/** A leaderboard row enriched with the player's Elo rating. */
export type RankedRow = PlayerRow & {
  rating: number | null;
  ratingProvisional: boolean;
  ratingDelta: number;
};

/** Sortable columns — the PlayerRow keys plus the derived "rating". */
export type LeaderKey = SortKey | 'rating';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const ppg = (n: number) => n.toFixed(1);

function RatingCell({ r }: { r: RankedRow }) {
  if (r.rating == null) return <span className="text-white/30">—</span>;
  const up = r.ratingDelta > 0;
  return (
    <span className="inline-flex items-center gap-1 justify-end">
      <span className="font-medium">
        {r.rating}
        {r.ratingProvisional && (
          <span className="text-white/40" title="Provisional — under 8 games">
            *
          </span>
        )}
      </span>
      {r.ratingDelta !== 0 && (
        <span className={`text-[10px] ${up ? 'text-emerald-300' : 'text-red-300'}`}>
          {up ? '▲' : '▼'}
          {Math.abs(r.ratingDelta)}
        </span>
      )}
    </span>
  );
}

function StreakBadge({ n }: { n: number }) {
  if (n === 0) return <span className="text-white/30">—</span>;
  const win = n > 0;
  return (
    <span className={win ? 'text-emerald-300' : 'text-red-300'}>
      {win ? 'W' : 'L'}
      {Math.abs(n)}
    </span>
  );
}

type Col = {
  key?: LeaderKey;
  label: string;
  title: string;
  align?: 'left' | 'right';
  /** Only shown in the "all stats" (full) view. */
  extra?: boolean;
  render: (r: RankedRow) => React.ReactNode;
};

const COLS: Col[] = [
  {
    key: 'name',
    label: 'Player',
    title: 'Player',
    align: 'left',
    render: (r) => (
      <Link
        href={`/stats/player/${encodeURIComponent(r.name)}`}
        className="hover:text-gold underline-offset-2 hover:underline"
      >
        {r.name}
      </Link>
    ),
  },
  { key: 'rating', label: 'Elo', title: 'Elo rating (▲▼ = last game; * = provisional)', render: (r) => <RatingCell r={r} /> },
  { key: 'games', label: 'GP', title: 'Games played', render: (r) => r.games },
  { key: 'wins', label: 'W', title: 'Wins', render: (r) => r.wins },
  { key: 'losses', label: 'L', title: 'Losses', render: (r) => r.losses },
  { key: 'winPct', label: 'Win%', title: 'Win percentage', render: (r) => <span className="text-gold">{pct(r.winPct)}</span> },
  { key: 'ppgFor', label: 'PPG', title: 'Avg points scored per game', render: (r) => ppg(r.ppgFor) },
  { key: 'ppgAgainst', label: 'PA', title: 'Avg points conceded per game', extra: true, render: (r) => ppg(r.ppgAgainst) },
  {
    key: 'pointDiff',
    label: '+/−',
    title: 'Point differential per game',
    render: (r) => (
      <span className={r.pointDiff >= 0 ? 'text-emerald-300' : 'text-red-300'}>
        {r.pointDiff >= 0 ? '+' : ''}
        {ppg(r.pointDiff)}
      </span>
    ),
  },
  { key: 'tricks', label: 'Trk', title: 'Total tricks won', extra: true, render: (r) => r.tricks },
  { key: 'defensiveTricks', label: 'Def', title: 'Defensive tricks (won when not the maker)', extra: true, render: (r) => r.defensiveTricks },
  { key: 'defensiveEuchres', label: '🛡', title: 'Euchres inflicted on opponents while defending', extra: true, render: (r) => r.defensiveEuchres },
  { key: 'handsCalled', label: 'Called', title: 'Hands called (became maker)', extra: true, render: (r) => r.handsCalled },
  { key: 'callsWon', label: 'Made', title: 'Calls won (not euchred)', extra: true, render: (r) => r.callsWon },
  { key: 'callPct', label: 'Call%', title: 'Win rate when calling trump', render: (r) => pct(r.callPct) },
  { key: 'euchres', label: 'Set', title: 'Times euchred (set) while calling', extra: true, render: (r) => <span className="text-red-300/90">{r.euchres}</span> },
  { key: 'marches', label: '🌟', title: 'Marches (5-trick sweeps)', render: (r) => r.marches },
  { key: 'loneCalled', label: '🔥#', title: 'Loners called', extra: true, render: (r) => r.loneCalled },
  { key: 'loneWon', label: '🔥✓', title: 'Loners made', extra: true, render: (r) => r.loneWon },
  { key: 'longestWinStreak', label: 'Wstk', title: 'Longest win streak', extra: true, render: (r) => r.longestWinStreak },
  { key: 'longestLossStreak', label: 'Lstk', title: 'Longest losing streak', extra: true, render: (r) => r.longestLossStreak },
  { key: 'currentStreak', label: 'Streak', title: 'Current win/loss streak', render: (r) => <StreakBadge n={r.currentStreak} /> },
];

export default function Leaderboard({
  rows,
  sortKey,
  sortDir,
  onSort,
  full = false,
}: {
  rows: RankedRow[];
  sortKey: LeaderKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: LeaderKey) => void;
  /** Show every stat column (the "all stats" view). */
  full?: boolean;
}) {
  const cols = full ? COLS : COLS.filter((c) => !c.extra);
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className={`w-full text-sm ${full ? 'min-w-[1120px]' : 'min-w-[760px]'}`}>
        <thead className="text-white/60 text-[10px] uppercase tracking-wider">
          <tr>
            <th className="text-right py-1 pr-2 w-8">#</th>
            {cols.map((c) => {
              const active = c.key && c.key === sortKey;
              return (
                <th
                  key={c.label}
                  title={c.title}
                  className={`py-1 px-1.5 ${c.align === 'left' ? 'text-left' : 'text-right'} ${
                    c.key ? 'cursor-pointer select-none hover:text-white' : ''
                  } ${active ? 'text-gold' : ''}`}
                  onClick={c.key ? () => onSort(c.key!) : undefined}
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.label}
                  {active && <span aria-hidden>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.name} className={`border-t border-white/5 ${idx === 0 ? 'bg-gold/5' : ''}`}>
              <td className="text-right py-1.5 pr-2 text-white/50 tabular-nums">{idx + 1}</td>
              {cols.map((c) => (
                <td
                  key={c.label}
                  className={`py-1.5 px-1.5 ${
                    c.align === 'left' ? 'text-left font-medium' : 'text-right tabular-nums'
                  }`}
                >
                  {c.align === 'left' && idx === 0 && (
                    <span className="mr-1" aria-hidden>
                      👑
                    </span>
                  )}
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
