'use client';
import { Fragment } from 'react';
import type { Badge } from '@/lib/stats-achievements';
import PlayerLink from './PlayerLink';

/** "Mar 2026" — when a badge was first earned. */
export function earnedDateLabel(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

/** Horizontal strip of earned badges. */
export default function AchievementsStrip({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) {
    return <p className="text-white/40 text-sm">No achievements unlocked yet — get playing!</p>;
  }
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
      {badges.map((b) => {
        const holdersTitle = b.earned
          .map((e) => (e.ts ? `${e.name} — earned ${earnedDateLabel(e.ts)}` : e.name))
          .join('\n');
        return (
          <div
            key={b.id}
            className={`shrink-0 w-40 rounded-xl border p-3 ${
              b.kind === 'fun' ? 'bg-black/40 border-gold/40' : 'bg-black/40 border-white/10'
            }`}
          >
            <div className="text-2xl leading-none" aria-hidden>
              {b.emoji}
            </div>
            <div className="text-sm font-semibold text-gold mt-1.5">{b.name}</div>
            <div className="text-[11px] text-white/45 leading-snug">{b.desc}</div>
            <div className="text-xs text-white/85 mt-1.5 line-clamp-2" title={holdersTitle}>
              {b.earned.map((e, i) => (
                <Fragment key={e.name}>
                  {i > 0 && ', '}
                  <PlayerLink name={e.name} />
                </Fragment>
              ))}
            </div>
            {b.earned.length === 1 && b.earned[0].ts != null && (
              <div className="text-[10px] text-white/40 mt-0.5">
                earned {earnedDateLabel(b.earned[0].ts)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
