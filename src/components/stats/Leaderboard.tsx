'use client';
import type { PlayerRow, SortKey } from '@/lib/stats-analytics';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Column definitions. `key` (when present) makes the header sortable. */
type Col = {
  key?: SortKey;
  label: string;
  title: string;
  align?: 'left' | 'right';
  render: (r: PlayerRow) => React.ReactNode;
};

const COLS: Col[] = [
  { key: 'name', label: 'Player', title: 'Player', align: 'left', render: (r) => r.name },
  { key: 'games', label: 'GP', title: 'Games played', render: (r) => r.games },
  { key: 'wins', label: 'W', title: 'Wins', render: (r) => r.wins },
  { key: 'losses', label: 'L', title: 'Losses', render: (r) => r.losses },
  { key: 'winPct', label: 'Win%', title: 'Win percentage', render: (r) => <span className="text-gold">{pct(r.winPct)}</span> },
  { key: 'tricks', label: '🏆', title: 'Total tricks won', render: (r) => r.tricks },
  { key: 'handsCalled', label: 'Called', title: 'Hands called (became maker)', render: (r) => r.handsCalled },
  { key: 'callPct', label: 'Call%', title: 'Win rate when calling trump', render: (r) => pct(r.callPct) },
  { key: 'marches', label: '🌟', title: 'Marches (5-trick sweeps)', render: (r) => r.marches },
  { key: 'euchres', label: '❌', title: 'Times euchred (set) while calling', render: (r) => <span className="text-red-300/90">{r.euchres}</span> },
  { key: 'loneWon', label: '🔥', title: 'Loners made', render: (r) => r.loneWon },
  { key: 'currentStreak', label: 'Streak', title: 'Current win/loss streak', render: (r) => <StreakBadge n={r.currentStreak} /> },
];

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

export default function Leaderboard({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: PlayerRow[];
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[680px] text-sm">
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
            <tr
              key={r.name}
              className={`border-t border-white/5 ${idx === 0 ? 'bg-gold/5' : ''}`}
            >
              <td className="text-right py-1.5 pr-2 text-white/50 tabular-nums">{idx + 1}</td>
              {COLS.map((c) => (
                <td
                  key={c.label}
                  className={`py-1.5 px-1.5 ${c.align === 'left' ? 'text-left font-medium' : 'text-right tabular-nums'}`}
                >
                  {c.align === 'left' && idx === 0 && <span className="mr-1" aria-hidden>👑</span>}
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
