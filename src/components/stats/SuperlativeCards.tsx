'use client';
import type { Superlative } from '@/lib/stats-analytics';
import PlayerLink from './PlayerLink';

/** The "narrative layer" — a row of award cards highlighting standout players. */
export default function SuperlativeCards({ awards }: { awards: Superlative[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {awards.map((a) => {
        const earned = a.player !== null;
        return (
          <div
            key={a.id}
            className={`rounded-xl border p-3 flex flex-col gap-1 ${
              earned
                ? 'bg-black/40 border-gold/40'
                : 'bg-black/20 border-white/10 opacity-70'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-lg leading-none" aria-hidden>
                {a.emoji}
              </span>
              <span className="text-[11px] uppercase tracking-wider text-gold font-semibold">
                {a.title}
              </span>
            </div>
            <div className="font-display text-lg sm:text-xl text-white leading-tight truncate" title={a.player ?? ''}>
              {a.player ? <PlayerLink name={a.player} /> : '—'}
            </div>
            <div className="text-sm text-white/90 font-medium">{a.value}</div>
            <div className="text-[11px] text-white/50 leading-snug mt-0.5">
              {earned && a.sub ? a.sub : a.blurb}
            </div>
          </div>
        );
      })}
    </div>
  );
}
