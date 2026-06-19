'use client';
import type { H2HRow } from '@/lib/stats-analytics';

/**
 * The "Frenemy Metric" — head-to-head records between two players who sat on
 * opposing teams. Sorted by how often they've clashed.
 */
export default function FrenemyTable({
  rows,
  minMeetings,
}: {
  rows: H2HRow[];
  minMeetings: number;
}) {
  const data = rows
    .filter((r) => r.games >= minMeetings)
    .sort((a, b) => b.games - a.games || a.a.localeCompare(b.a))
    .slice(0, 16);

  if (data.length === 0) {
    return (
      <div className="text-white/40 text-sm py-2">
        No head-to-head rivalries yet (need players who&apos;ve faced off at least {minMeetings}{' '}
        {minMeetings === 1 ? 'time' : 'times'}).
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1">
      {data.map((r) => {
        const aLeads = r.aWins > r.bWins;
        const bLeads = r.bWins > r.aWins;
        return (
          <div
            key={r.key}
            className="flex items-center justify-between gap-2 py-1.5 border-t border-white/5 text-sm"
          >
            <div className="min-w-0 truncate">
              <span className={aLeads ? 'text-gold font-medium' : 'text-white/85'}>{r.a}</span>
              <span className="text-white/40"> vs </span>
              <span className={bLeads ? 'text-gold font-medium' : 'text-white/85'}>{r.b}</span>
            </div>
            <div className="whitespace-nowrap tabular-nums">
              <span className={aLeads ? 'text-gold font-semibold' : 'text-white/85'}>{r.aWins}</span>
              <span className="text-white/40">–</span>
              <span className={bLeads ? 'text-gold font-semibold' : 'text-white/85'}>{r.bWins}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
