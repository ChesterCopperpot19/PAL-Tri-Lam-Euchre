'use client';
import Link from 'next/link';
import type { PlayerRow, SortKey } from '@/lib/stats-analytics';
import Seahorse from './Seahorse';
import { pct } from '@/lib/stats-format';

/** A leaderboard row enriched with the player's Elo rating. */
export type RankedRow = PlayerRow & {
  rating: number | null;
  ratingProvisional: boolean;
  ratingDelta: number;
};

/** Sortable columns — the PlayerRow keys plus the derived "rating". */
export type LeaderKey = SortKey | 'rating';

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

/** Last-5 W/L strip, oldest → newest. */
function FormStrip({ form }: { form: boolean[] }) {
  if (!form.length) return <span className="text-white/30">—</span>;
  return (
    <span
      className="inline-flex gap-0.5 align-middle"
      title={form.map((w) => (w ? 'W' : 'L')).join(' ')}
    >
      {form.map((w, i) => (
        <span
          key={i}
          className={`inline-block w-2 h-2 rounded-sm ${
            w ? 'bg-emerald-400/80' : 'bg-red-400/70'
          }`}
        />
      ))}
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
  /** Header group ("Record", "Calling", …) rendered as a top header row. */
  group: string;
  render: (r: RankedRow) => React.ReactNode;
};

const COLS: Col[] = [
  // ── Record ──
  { group: 'Record', key: 'rating', label: 'Elo', title: 'Elo rating (▲▼ = last game; * = provisional)', render: (r) => <RatingCell r={r} /> },
  { group: 'Record', key: 'games', label: 'GP', title: 'Games played', render: (r) => r.games },
  { group: 'Record', key: 'wins', label: 'W', title: 'Wins', render: (r) => r.wins },
  { group: 'Record', key: 'losses', label: 'L', title: 'Losses', render: (r) => r.losses },
  { group: 'Record', key: 'winPct', label: 'Win%', title: 'Win percentage', render: (r) => <span className="text-gold">{pct(r.winPct)}</span> },
  { group: 'Record', key: 'ppgFor', label: 'PPG', title: 'Avg points scored per game', render: (r) => ppg(r.ppgFor) },
  { group: 'Record', key: 'ppgAgainst', label: 'PA', title: 'Avg points conceded per game', extra: true, render: (r) => ppg(r.ppgAgainst) },
  {
    group: 'Record',
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
  { group: 'Record', key: 'tricks', label: 'Trk', title: 'Total tricks won', extra: true, render: (r) => r.tricks },
  // ── Calling ──
  { group: 'Calling', key: 'handsCalled', label: 'Called', title: 'Hands called (became maker)', extra: true, render: (r) => r.handsCalled },
  { group: 'Calling', key: 'callsWon', label: 'Made', title: 'Calls won (not euchred)', extra: true, render: (r) => r.callsWon },
  { group: 'Calling', key: 'callPct', label: 'Call%', title: 'Win rate when calling trump', render: (r) => pct(r.callPct) },
  { group: 'Calling', key: 'bidPct', label: 'Bid%', title: 'How often you call trump (calls ÷ hands dealt)', extra: true, render: (r) => (r.bidPct == null ? <span className="text-white/30">—</span> : pct(r.bidPct)) },
  {
    group: 'Calling',
    key: 'orderPct',
    label: 'Ord%',
    title: 'Of your calls, % ordered up in round 1 (vs named in round 2). Needs hand-logged games.',
    extra: true,
    render: (r) => (r.orderPct == null ? <span className="text-white/30">—</span> : pct(r.orderPct)),
  },
  {
    group: 'Calling',
    key: 'r1CallPct',
    label: 'R1%',
    title: 'Make rate on round-1 order-ups. Needs hand-logged games.',
    extra: true,
    render: (r) => (r.r1CallPct == null ? <span className="text-white/30">—</span> : pct(r.r1CallPct)),
  },
  {
    group: 'Calling',
    key: 'r2CallPct',
    label: 'R2%',
    title: 'Make rate on round-2 named calls. Needs hand-logged games.',
    extra: true,
    render: (r) => (r.r2CallPct == null ? <span className="text-white/30">—</span> : pct(r.r2CallPct)),
  },
  {
    group: 'Calling',
    key: 'netPtsPerCall',
    label: 'Net/Cl',
    title: 'Net points your calls net the team, per call (points won − points conceded). Needs hand-logged games.',
    extra: true,
    render: (r) =>
      r.netPtsPerCall == null ? (
        <span className="text-white/30">—</span>
      ) : (
        <span className={r.netPtsPerCall >= 0 ? 'text-emerald-300' : 'text-red-300'}>
          {r.netPtsPerCall >= 0 ? '+' : ''}
          {r.netPtsPerCall.toFixed(1)}
        </span>
      ),
  },
  { group: 'Calling', key: 'euchres', label: 'Set', title: 'Times euchred (set) while calling', extra: true, render: (r) => <span className="text-red-300/90">{r.euchres}</span> },
  { group: 'Calling', key: 'marches', label: '🌟', title: 'Marches (5-trick sweeps)', render: (r) => r.marches },
  // ── Loners ──
  { group: 'Loners', key: 'loneCalled', label: '🔥#', title: 'Loners called', extra: true, render: (r) => r.loneCalled },
  { group: 'Loners', key: 'loneWon', label: '🔥✓', title: 'Loners made', extra: true, render: (r) => r.loneWon },
  {
    group: 'Loners',
    key: 'aloneMakePct',
    label: 'Aln%',
    title: 'Loners made ÷ loners called',
    extra: true,
    render: (r) => (r.aloneMakePct == null ? <span className="text-white/30">—</span> : pct(r.aloneMakePct)),
  },
  // ── Defense ──
  { group: 'Defense', key: 'defensiveTricks', label: 'Def', title: 'Defensive tricks (won when not the maker)', extra: true, render: (r) => r.defensiveTricks },
  { group: 'Defense', key: 'defensiveEuchres', label: '🛡', title: 'Euchres inflicted on opponents while defending', extra: true, render: (r) => r.defensiveEuchres },
  {
    group: 'Defense',
    key: 'defEuchreRate',
    label: 'DfE%',
    title: 'Euchres you inflict per hand played on defense. Needs hand-logged games.',
    extra: true,
    render: (r) => (r.defEuchreRate == null ? <span className="text-white/30">—</span> : pct(r.defEuchreRate)),
  },
  {
    group: 'Defense',
    key: 'lonersStopped',
    label: 'Stops',
    title: 'Loners stopped — lone maker held under 5 tricks while you defended. Needs hand-logged games.',
    extra: true,
    render: (r) =>
      r.lonersStopped == null ? (
        <span className="text-white/30">—</span>
      ) : (
        <span title={`${r.lonersStopped} of ${r.lonersFaced} loners faced`}>{r.lonersStopped}</span>
      ),
  },
  // ── Streaks ──
  { group: 'Streaks', key: 'longestWinStreak', label: 'Wstk', title: 'Longest win streak', extra: true, render: (r) => r.longestWinStreak },
  { group: 'Streaks', key: 'longestLossStreak', label: 'Lstk', title: 'Longest losing streak', extra: true, render: (r) => r.longestLossStreak },
  { group: 'Streaks', key: 'currentStreak', label: 'Streak', title: 'Current win/loss streak', render: (r) => <StreakBadge n={r.currentStreak} /> },
  { group: 'Streaks', label: 'Form', title: 'Last 5 games, oldest → newest', render: (r) => <FormStrip form={r.recentForm} /> },
];

export default function Leaderboard({
  rows,
  sortKey,
  sortDir,
  onSort,
  full = false,
  seahorseName = null,
}: {
  rows: RankedRow[];
  sortKey: LeaderKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: LeaderKey) => void;
  /** Show every stat column (the "all stats" view). */
  full?: boolean;
  /** Player who gets the WFEPE seahorse (lowest Elo). */
  seahorseName?: string | null;
}) {
  const cols = full ? COLS : COLS.filter((c) => !c.extra);
  // Contiguous runs of the same group → colSpans for the top header row.
  const groups: { label: string; span: number }[] = [];
  for (const c of cols) {
    const last = groups[groups.length - 1];
    if (last && last.label === c.group) last.span += 1;
    else groups.push({ label: c.group, span: 1 });
  }
  const nameActive = sortKey === 'name';
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className={`w-full text-sm ${full ? 'min-w-[1240px]' : 'min-w-[820px]'}`}>
        <thead className="text-white/60 text-[10px] uppercase tracking-wider">
          <tr>
            <th rowSpan={2} className="text-right py-1 pr-2 w-8 align-bottom sticky left-0 z-20 bg-[#0b1330]">
              #
            </th>
            <th
              rowSpan={2}
              className={`py-1 px-1.5 text-left align-bottom cursor-pointer select-none hover:text-white sticky left-8 z-20 bg-[#0b1330] border-r border-white/10 ${
                nameActive ? 'text-gold' : ''
              }`}
              onClick={() => onSort('name')}
              aria-sort={nameActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
            >
              Player
              {nameActive && <span aria-hidden>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
            </th>
            {groups.map((g, i) => (
              <th
                key={`${g.label}-${i}`}
                colSpan={g.span}
                className="text-center pb-0.5 text-[9px] tracking-[0.2em] text-white/35 border-b border-white/10"
              >
                {g.label}
              </th>
            ))}
          </tr>
          <tr>
            {cols.map((c) => {
              const active = c.key && c.key === sortKey;
              return (
                <th
                  key={c.label}
                  title={c.title}
                  className={`py-1 px-1.5 text-right ${
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
              <td className="text-right py-1.5 pr-2 text-white/50 tabular-nums sticky left-0 z-10 bg-[#0b1330]">{idx + 1}</td>
              <td className="py-1.5 px-1.5 text-left font-medium sticky left-8 z-10 bg-[#0b1330] border-r border-white/10">
                {idx === 0 && (
                  <span className="mr-1" aria-hidden>
                    👑
                  </span>
                )}
                <Link
                  href={`/stats/player/${encodeURIComponent(r.name)}`}
                  className="hover:text-gold underline-offset-2 hover:underline"
                >
                  {r.name}
                </Link>
                {seahorseName && r.name === seahorseName && (
                  <span
                    className="inline-block ml-1 align-[-2px] text-cyan-300"
                    title="WFEPE — lowest Elo"
                  >
                    <Seahorse size={14} />
                  </span>
                )}
              </td>
              {cols.map((c) => (
                <td key={c.label} className="py-1.5 px-1.5 text-right tabular-nums">
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
