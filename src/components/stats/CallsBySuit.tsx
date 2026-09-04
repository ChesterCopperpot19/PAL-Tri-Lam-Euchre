'use client';
// Trump calls broken down by suit — who calls what, and how it works out.
// Club-wide bar chart (share of calls + make rate per suit) and a per-player
// heatmap table matching the calls-by-rank panel.

import { useMemo } from 'react';
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
import { computeCallSuits, suitSymbol, SUITS } from '@/lib/stats-hands';
import { SUIT_COLOR_ON_DARK } from '@/lib/suits';
import PlayerLink from './PlayerLink';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const TICK = 'rgba(255,255,255,0.72)';
const GRID = 'rgba(255,255,255,0.08)';

function SuitHeader({ s }: { s: (typeof SUITS)[number] }) {
  return <span style={{ color: SUIT_COLOR_ON_DARK[s] }}>{suitSymbol(s)}</span>;
}

export default function CallsBySuit({ matches }: { matches: MatchRecord[] }) {
  const { bySuit, madeBySuit, total, players } = useMemo(() => computeCallSuits(matches), [matches]);

  if (total === 0) {
    return (
      <p className="text-white/45 text-sm">
        No call data yet — this fills in from games recorded after hand-level tracking went live.
      </p>
    );
  }

  const barData = {
    labels: SUITS.map((s) => suitSymbol(s)),
    datasets: [
      {
        label: 'Share of calls',
        data: SUITS.map((s) => (total ? Math.round((bySuit[s] / total) * 100) : 0)),
        // Four-color deck: each bar carries its own suit color.
        backgroundColor: SUITS.map((s) => SUIT_COLOR_ON_DARK[s]),
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
            const s = SUITS[ctx.dataIndex];
            const made = bySuit[s] ? Math.round((madeBySuit[s] / bySuit[s]) * 100) : 0;
            return ` ${ctx.parsed.y}% of calls · ${bySuit[s]} calls, ${made}% made`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: TICK, font: { size: 16 } }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: TICK, callback: (v) => `${v}%` }, grid: { color: GRID } },
    },
  };

  const rows = players.slice(0, 12);
  const tint = (pct: number) => `rgba(255,184,28,${Math.min(0.85, pct * 1.8).toFixed(3)})`;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] text-white/45 mb-1">
          % of all trump calls by suit (hover for make rate)
        </div>
        <div style={{ height: 220 }}>
          <Bar data={barData} options={barOpts} />
        </div>
      </div>

      <div>
        <div className="text-[11px] text-white/45 mb-1.5">
          Each player’s calls by suit — % of their own calls (darker = more) · small number = make
          rate on that suit
        </div>
        <div className="overflow-x-auto">
          <table className="border-separate text-sm" style={{ borderSpacing: 2 }}>
            <thead className="text-white/60 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="sticky left-0 z-10 bg-black/40 text-left pr-2">Player</th>
                {SUITS.map((s) => (
                  <th key={s} className="w-14 text-center text-sm">
                    <SuitHeader s={s} />
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
                  {SUITS.map((s) => (
                    <td
                      key={s}
                      className="w-14 h-10 text-center rounded tabular-nums text-white/90 text-xs leading-tight"
                      style={{ background: tint(p.share[s]) }}
                      title={`${p.name}: ${suitSymbol(s)} — ${Math.round(p.share[s] * 100)}% of their calls (${p.counts[s]} of ${p.total}); ${
                        p.makePct[s] == null ? 'no calls' : `${Math.round(p.makePct[s]! * 100)}% made`
                      }`}
                    >
                      {p.counts[s] ? (
                        <>
                          {Math.round(p.share[s] * 100)}
                          <div className="text-[9px] text-white/60">
                            {p.makePct[s] == null ? '' : `${Math.round(p.makePct[s]! * 100)}%✓`}
                          </div>
                        </>
                      ) : (
                        '·'
                      )}
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
