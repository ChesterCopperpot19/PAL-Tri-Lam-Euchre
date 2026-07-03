'use client';
// Chart.js charts for the dashboard (club Elo timeline + games-played volume).
// Registered once at module load; rendered only on the client by the page
// (gated behind a `mounted` flag) so there's no SSR/canvas mismatch.

import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Legend,
  Tooltip,
  type TooltipItem,
  type ChartOptions,
} from 'chart.js';
import type { PlayerRow } from '@/lib/stats-analytics';
import type { EloResult } from '@/lib/stats-elo';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Legend, Tooltip);

const GOLD = '#FFB81C';
const BLUE = '#1f4ea3';
const TICK = 'rgba(255,255,255,0.72)';
const GRID = 'rgba(255,255,255,0.08)';

/** One distinct line color per player (cycles if the club outgrows it). */
const LINE_COLORS = [
  '#FFB81C', // gold
  '#38bdf8', // sky
  '#34d399', // emerald
  '#f472b6', // pink
  '#a78bfa', // violet
  '#fb923c', // orange
  '#f87171', // red
  '#a3e635', // lime
];

/** Every player's Elo rating over time — the story of the rivalry. */
export function EloTimelineChart({
  elo,
  names,
}: {
  elo: Map<string, EloResult>;
  /** Which players to draw (e.g. the leaderboard-qualified set). */
  names: string[];
}) {
  const series = names
    .map((n) => elo.get(n))
    .filter((r): r is EloResult => !!r && r.history.length > 0)
    .sort((a, b) => b.rating - a.rating);

  const data = {
    datasets: series.map((r, i) => ({
      label: r.name,
      data: r.history.map((h) => ({ x: h.ts, y: h.rating })),
      borderColor: LINE_COLORS[i % LINE_COLORS.length],
      backgroundColor: LINE_COLORS[i % LINE_COLORS.length],
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.25,
    })),
  };
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { labels: { color: TICK, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'line'>[]) =>
            items.length && items[0].parsed.x != null ? fmtDate(Number(items[0].parsed.x)) : '',
          label: (ctx: TooltipItem<'line'>) => ` ${ctx.dataset.label}: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        ticks: {
          color: TICK,
          maxTicksLimit: 7,
          callback: (v) => fmtDate(Number(v)),
        },
        grid: { color: GRID },
      },
      y: { ticks: { color: TICK, precision: 0 }, grid: { color: GRID } },
    },
  };
  return (
    <div style={{ height: 280 }}>
      <Line data={data} options={options} />
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
