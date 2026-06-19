'use client';
// Each partnership as a dot: team across the x-axis (sorted best → worst),
// win % up the y-axis, dot size = games played, color = win tier. Dashed 50%
// reference line. Driven by the dashboard's "min games together" control.

import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  type TooltipItem,
  type ChartOptions,
} from 'chart.js';
import type { DuoRow } from '@/lib/stats-analytics';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

const TICK = 'rgba(255,255,255,0.72)';
const GRID = 'rgba(255,255,255,0.08)';
const REF = 'rgba(255,255,255,0.4)';
const GREEN = '#34d399';
const GOLD = '#FFB81C';
const RED = '#f87171';

const tier = (winPct: number) => (winPct >= 0.55 ? GREEN : winPct <= 0.45 ? RED : GOLD);
const rOf = (games: number) => 4 + Math.sqrt(games) * 1.6;

export default function PartnershipScatter({
  duos,
  minGames,
}: {
  duos: DuoRow[];
  minGames: number;
}) {
  const rows = duos
    .filter((d) => d.games >= minGames)
    .slice()
    .sort((a, b) => b.winPct - a.winPct || b.games - a.games);

  if (rows.length < 2) {
    return (
      <p className="text-white/40 text-sm">
        Not enough partnerships with at least {minGames} games yet.
      </p>
    );
  }

  const labels = rows.map((d) => `${d.a} + ${d.b}`);
  const wins = rows.map((d) => Math.round(d.winPct * 100));

  const data = {
    labels,
    datasets: [
      {
        // 50% break-even reference line across all teams.
        data: labels.map(() => 50),
        borderColor: REF,
        borderDash: [5, 5],
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
      },
      {
        data: wins,
        showLine: false,
        clip: false as const, // let edge dots render fully
        pointBackgroundColor: rows.map((d) => tier(d.winPct)),
        pointBorderColor: 'transparent',
        pointRadius: rows.map((d) => rOf(d.games)),
        pointHoverRadius: rows.map((d) => rOf(d.games) + 2),
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        filter: (i) => i.datasetIndex === 1,
        callbacks: {
          label: (c: TooltipItem<'line'>) => {
            const d = rows[c.dataIndex];
            return ` ${Math.round(d.winPct * 100)}%  ·  ${d.wins}-${d.losses}  ·  ${d.games} games`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { autoSkip: false, maxRotation: 55, minRotation: 55, color: TICK, font: { size: 11 } },
        grid: { display: false },
      },
      y: {
        title: { display: true, text: 'win %', color: TICK },
        min: 0,
        max: 100,
        ticks: { color: TICK, stepSize: 25, callback: (v) => `${v}%` },
        grid: { color: GRID },
      },
    },
  };

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50 mb-2">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: GREEN }} />
          winning (≥55%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: GOLD }} />
          even
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: RED }} />
          losing (≤45%)
        </span>
        <span>· dot size = games played</span>
      </div>
      <div style={{ height: 410 }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
