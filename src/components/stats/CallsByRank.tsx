'use client';
// Trump calls broken down by the up-card rank ordered up (round 1), or "R2" for a
// round-2 named call. Club-wide bar chart + a per-player heatmap table.

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  type TooltipItem,
  type ChartOptions,
} from 'chart.js';
import type { MatchRecord } from '@/lib/shared-types';
import { computeCallRanks, CALL_RANKS, type CallCategory } from '@/lib/stats-hands';
import PlayerLink from './PlayerLink';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const GOLD = '#FFB81C';
const TICK = 'rgba(255,255,255,0.72)';
const GRID = 'rgba(255,255,255,0.08)';

export default function CallsByRank({ matches }: { matches: MatchRecord[] }) {
  const { byRank, total, players } = computeCallRanks(matches);

  if (total === 0) {
    return (
      <p className="text-white/45 text-sm">
        No call data yet — this fills in from games recorded after hand-level tracking went live.
      </p>
    );
  }

  const barData = {
    labels: CALL_RANKS.map((c) => c),
    datasets: [
      {
        label: 'Calls',
        data: CALL_RANKS.map((c) => byRank[c]),
        backgroundColor: GOLD,
        borderRadius: 4,
        maxBarThickness: 52,
      },
    ],
  };
  const barOpts: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const n = ctx.parsed.y as number;
            return ` ${n} calls · ${total ? Math.round((n / total) * 100) : 0}%`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: TICK }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: TICK, precision: 0 }, grid: { color: GRID } },
    },
  };

  const rows = players.slice(0, 12);
  const tint = (pct: number) => `rgba(255,184,28,${Math.min(0.85, pct * 1.8).toFixed(3)})`;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] text-white/45 mb-1">
          Across all players · up-card rank ordered up (round 1), or “R2” for a round-2 named call
        </div>
        <div style={{ height: 220 }}>
          <Bar data={barData} options={barOpts} />
        </div>
      </div>

      <div>
        <div className="text-[11px] text-white/45 mb-1.5">
          Each player’s calls by rank — % of their own calls (darker = more)
        </div>
        <div className="overflow-x-auto">
          <table className="border-separate text-sm" style={{ borderSpacing: 2 }}>
            <thead className="text-white/60 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="sticky left-0 z-10 bg-black/40 text-left pr-2">Player</th>
                {CALL_RANKS.map((c) => (
                  <th key={c} className="w-10 text-center" title={c === 'R2' ? 'Round-2 named call' : `Ordered up a ${c}`}>
                    {c}
                  </th>
                ))}
                <th className="text-right pl-3">Calls</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.name}>
                  <th className="sticky left-0 z-10 bg-black/40 text-left pr-2 font-medium whitespace-nowrap max-w-[110px] truncate">
                    <PlayerLink name={p.name} />
                  </th>
                  {CALL_RANKS.map((c) => (
                    <td
                      key={c}
                      className="w-10 h-9 text-center rounded tabular-nums text-white/90 text-xs leading-none"
                      style={{ background: tint(p.pct[c]) }}
                      title={`${p.name}: ${c} — ${Math.round(p.pct[c] * 100)}% (${p.counts[c]} of ${p.total})`}
                    >
                      {p.counts[c] ? Math.round(p.pct[c] * 100) : '·'}
                    </td>
                  ))}
                  <td className="text-right pl-3 tabular-nums text-white/70">{p.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
