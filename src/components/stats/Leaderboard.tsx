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
  { key: 'callPct', label: 'Call%', title: 'Win rate when calling trump', render: (r) => pct(r.callPct) },
  { key: 'marches', label: '🌟', title: 'Marches', render: (r) => r.marches },
  { key: 'currentStreak', label: 'Streak', title: 'Current win/loss streak', render: (r) => <StreakBadge n={r.currentStreak} /> },
];

export default function Leaderboard({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: RankedRow[];
  sortKey: LeaderKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: LeaderKey) => void;
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="text-white/60 text-[10px] uppercase tracking-wider">
          <tr>
            <th className="text-right py-1 pr-2 w-8">#</th>
            {COLS.map((c) => {
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
              {COLS.map((c) => (
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
