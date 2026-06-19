'use client';
// Radar (player profile) + Elo-over-time line. Client-only canvas.

import { Radar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  type TooltipItem,
  type ChartOptions,
} from 'chart.js';
import type { RadarAxes } from '@/lib/stats-profile';
import type { EloPoint } from '@/lib/stats-elo';

ChartJS.register(RadialLinearScale, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const GOLD = '#FFB81C';
const TICK = 'rgba(255,255,255,0.6)';
const GRID = 'rgba(255,255,255,0.12)';

const RADAR_LABELS = ['Maker', 'Defense', 'Loner', 'Consistency', 'Aggression'];
const RADAR_ORDER: (keyof RadarAxes)[] = ['maker', 'defense', 'loner', 'consistency', 'aggression'];

export function RadarChart({ axes, raw }: { axes: RadarAxes; raw: RadarAxes }) {
  const data = {
    labels: RADAR_LABELS,
    datasets: [
      {
        label: 'Profile',
        data: RADAR_ORDER.map((k) => axes[k]),
        backgroundColor: 'rgba(255,184,28,0.2)',
        borderColor: GOLD,
        borderWidth: 2,
        pointBackgroundColor: GOLD,
        pointRadius: 3,
      },
    ],
  };
  const options: ChartOptions<'radar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (c: TooltipItem<'radar'>) => {
            const k = RADAR_ORDER[c.dataIndex];
            const rv = raw[k];
            const fmt = k === 'maker' || k === 'loner' ? `${Math.round(rv * 100)}%` : rv.toFixed(2);
            return ` ${RADAR_LABELS[c.dataIndex]}: ${c.formattedValue}/100 (${fmt})`;
          },
        },
      },
    },
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { display: false, stepSize: 20 },
        grid: { color: GRID },
        angleLines: { color: GRID },
        pointLabels: { color: TICK, font: { size: 11 } },
      },
    },
  };
  return (
    <div style={{ height: 280 }}>
      <Radar data={data} options={options} />
    </div>
  );
}

export function EloLineChart({ history }: { history: EloPoint[] }) {
  const data = {
    labels: history.map((_, i) => `${i + 1}`),
    datasets: [
      {
        label: 'Elo',
        data: history.map((h) => h.rating),
        borderColor: GOLD,
        backgroundColor: 'rgba(255,184,28,0.15)',
        fill: true,
        tension: 0.25,
        pointRadius: history.length > 30 ? 0 : 2,
      },
    ],
  };
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => `Game ${items[0].label}`,
          label: (c: TooltipItem<'line'>) => ` Elo ${c.parsed.y}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: TICK, maxTicksLimit: 8 }, grid: { display: false } },
      y: { ticks: { color: TICK }, grid: { color: GRID } },
    },
  };
  return (
    <div style={{ height: 220 }}>
      <Line data={data} options={options} />
    </div>
  );
}
