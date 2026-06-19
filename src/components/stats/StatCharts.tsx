'use client';
// Chart.js bar charts (win-% efficiency ranking + games-played volume).
// Registered once at module load; rendered only on the client by the page
// (gated behind a `mounted` flag) so there's no SSR/canvas mismatch.

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
import type { PlayerRow } from '@/lib/stats-analytics';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const GOLD = '#FFB81C';
const BLUE = '#1f4ea3';
const TICK = 'rgba(255,255,255,0.72)';
const GRID = 'rgba(255,255,255,0.08)';

/** Horizontal bar chart ranking players by win %. */
export function WinPctChart({ players }: { players: PlayerRow[] }) {
  const rows = players.slice().sort((a, b) => b.winPct - a.winPct);
  const data = {
    labels: rows.map((r) => r.name),
    datasets: [
      {
        label: 'Win %',
        data: rows.map((r) => Math.round(r.winPct * 100)),
        backgroundColor: GOLD,
        borderRadius: 4,
        barThickness: 'flex' as const,
        maxBarThickness: 26,
      },
    ],
  };
  const options: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const r = rows[ctx.dataIndex];
            return ` ${ctx.parsed.x}%  ·  ${r.wins}–${r.losses} (${r.games} GP)`;
          },
        },
      },
    },
    scales: {
      x: {
        min: 0,
        max: 100,
        ticks: { color: TICK, callback: (v) => `${v}%` },
        grid: { color: GRID },
      },
      y: { ticks: { color: TICK }, grid: { color: GRID } },
    },
  };
  return (
    <div style={{ height: Math.max(160, rows.length * 32) }}>
      <Bar data={data} options={options} />
    </div>
  );
}

/** Vertical bar chart of games played — who the regulars are. */
export function VolumeChart({ players }: { players: PlayerRow[] }) {
  const rows = players.slice().sort((a, b) => b.games - a.games);
  const data = {
    labels: rows.map((r) => r.name),
    datasets: [
      {
        label: 'Games played',
        data: rows.map((r) => r.games),
        backgroundColor: BLUE,
        borderColor: GOLD,
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 48,
      },
    ],
  };
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const r = rows[ctx.dataIndex];
            return ` ${r.games} games  ·  ${r.wins}–${r.losses}`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: TICK }, grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: { color: TICK, precision: 0 },
        grid: { color: GRID },
      },
    },
  };
  return (
    <div style={{ height: 240 }}>
      <Bar data={data} options={options} />
    </div>
  );
}
