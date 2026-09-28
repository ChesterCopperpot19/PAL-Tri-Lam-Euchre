'use client';
// Swing chart: how many tricks the makers can still force, with perfect play
// from there on, before the first card and after every play. A drop is a maker
// misplay (▼), a rise is a defender misplay (▲). Reference lines mark 3 (the
// makers score) and 5 (a march). Hover or focus snaps to the nearest play; a
// click jumps the replay there.

import { useEffect, useRef, useState } from 'react';
import type { HandAnalysis } from '@/lib/solver/analyze';
import { SUIT_GLYPH } from '@/lib/suits';

// Validated with the dataviz palette checker against the chart surface #0E1638
// (dark mode): lightness band, chroma, CVD and normal-vision separation, contrast.
const LINE = '#5F8FF0';
const MAKER_MISS = '#E0663F';
const DEF_MISS = '#1FA198';
const SURFACE = '#0E1638';

const H = 190;
const PAD = { top: 14, right: 12, bottom: 26, left: 28 };

export default function SwingChart({
  analysis,
  names,
  step,
  onStep,
}: {
  analysis: HandAnalysis;
  names: Record<number, string>;
  /** Plays shown so far (0 = before the opening lead). */
  step: number;
  onStep: (step: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { swing, plays } = analysis;
  const n = swing.length - 1;
  const x = (i: number) => PAD.left + (i / n) * (w - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / 5) * (H - PAD.top - PAD.bottom);
  const perTrick = n / 5;

  // Step path: the value holds until the next card, then moves.
  let d = `M${x(0)},${y(swing[0])}`;
  for (let i = 1; i <= n; i++) d += ` H${x(i)} V${y(swing[i])}`;

  const shown = hover ?? step;
  const tip = shown > 0 ? plays[shown - 1] : null;

  function pick(clientX: number) {
    const r = wrap.current!.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - PAD.left) / (w - PAD.left - PAD.right)) * n);
    return Math.max(0, Math.min(n, i));
  }

  return (
    <div>
      {/* Legend: line key + marker shapes, so identity never rests on color. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/70 mb-2">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden><line x1="1" y1="4" x2="17" y2="4" stroke={LINE} strokeWidth="2" strokeLinecap="round" /></svg>
          Tricks the makers can force
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden><path d="M1,2 L11,2 L6,11 Z" fill={MAKER_MISS} /></svg>
          Maker misplay
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden><path d="M1,11 L11,11 L6,2 Z" fill={DEF_MISS} /></svg>
          Defender misplay
        </span>
      </div>

      <div
        ref={wrap}
        className="relative select-none"
        onPointerMove={(e) => setHover(pick(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onStep(pick(e.clientX))}
      >
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={`Swing chart: the makers could force ${swing[0]} tricks at the start and took ${swing[n]}.`}
          className="block cursor-pointer"
        >
          <rect x="0" y="0" width={w} height={H} rx="10" fill={SURFACE} />
          {/* Hairline grid at each trick count, labels in muted ink. */}
          {[0, 1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.08)" />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.55)">
                {v}
              </text>
            </g>
          ))}
          {/* Reference lines: the makers score at 3, march at 5. */}
          {[
            { v: 3, label: 'makers score' },
            { v: 5, label: 'march' },
          ].map((r) => (
            <g key={r.v}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y(r.v)} y2={y(r.v)} stroke="rgba(255,255,255,0.28)" />
              <text x={w - PAD.right - 2} y={y(r.v) - 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.6)">
                {r.label}
              </text>
            </g>
          ))}
          {/* Trick boundaries on the x axis. */}
          {[0, 1, 2, 3, 4].map((t) => (
            <g key={t}>
              <line x1={x(t * perTrick)} x2={x(t * perTrick)} y1={PAD.top} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.06)" />
              <text x={x(t * perTrick + perTrick / 2)} y={H - 8} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.55)">
                Trick {t + 1}
              </text>
            </g>
          ))}
          {/* Current position, then the hover crosshair. */}
          <line x1={x(step)} x2={x(step)} y1={PAD.top} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.45)" />
          {hover !== null && hover !== step && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.22)" />
          )}
          <path d={d} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {/* Position dot under the misplay markers, so a marker is never hidden. */}
          <circle cx={x(shown)} cy={y(swing[shown])} r="4.5" fill={LINE} stroke={SURFACE} strokeWidth="2" />
          {/* Misplay markers, ringed in the surface color so they read over the line. */}
          {plays.map((p, i) =>
            p.cost > 0 ? (
              <path
                key={i}
                transform={`translate(${x(i + 1)},${y(swing[i + 1])})`}
                d={p.maker ? 'M-6,-5 L6,-5 L0,6 Z' : 'M-6,5 L6,5 L0,-6 Z'}
                fill={p.maker ? MAKER_MISS : DEF_MISS}
                stroke={SURFACE}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            ) : null,
          )}
        </svg>

      </div>

      {/* Readout for the play under the pointer (or the current one): value first. */}
      <div className="mt-1.5 text-xs" aria-live="polite">
        <span className="text-white font-semibold">Makers can force {swing[shown]}</span>
        {tip && tip.cost > 0 && (
          <span className="text-white/70"> ({tip.maker ? '−' : '+'}{tip.cost})</span>
        )}
        <span className="text-white/55">
          {' · '}
          {tip
            ? `trick ${tip.trick + 1}, ${names[tip.seat]} played ${tip.card.rank}${SUIT_GLYPH[tip.card.suit]}`
            : 'before the opening lead'}
        </span>
      </div>
    </div>
  );
}
