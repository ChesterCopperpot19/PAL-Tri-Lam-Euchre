'use client';
// Who runs good: dealt-card luck reconstructed from the trick log. Loads the
// heavy per-card detail on mount (the default payload omits it).

import { useMemo } from 'react';
import type { MatchRecord } from '@/lib/shared-types';
import { computeLuck, EXPECTED_TRUMP_PER_HAND } from '@/lib/stats-luck';
import { useFullHands } from './useFullHands';
import PlayerLink from './PlayerLink';

export default function LuckIndex({ matches }: { matches: MatchRecord[] }) {
  const { detailed, loading } = useFullHands(matches);
  const rows = useMemo(() => computeLuck(detailed), [detailed]);

  if (loading && rows.length === 0) {
    return <p className="text-white/45 text-sm">Loading trick logs…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-white/45 text-sm">
        No trick data yet — this fills in from games recorded after hand-level tracking went live.
      </p>
    );
  }

  const luckiest = rows[0];
  const unluckiest = rows[rows.length - 1];

  return (
    <div className="space-y-3">
      {rows.length > 1 && luckiest !== unluckiest && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-white/50">🍀 Runs good</div>
            <div className="font-display text-xl text-white mt-0.5 truncate">
              <PlayerLink name={luckiest.name} />
            </div>
            <div className="text-xs text-white/60">
              {luckiest.avgTrump.toFixed(2)} trump/hand · {luckiest.rights} right bowers
            </div>
          </div>
          <div className="rounded-xl border border-red-400/30 bg-red-500/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-white/50">🪨 Runs bad</div>
            <div className="font-display text-xl text-white mt-0.5 truncate">
              <PlayerLink name={unluckiest.name} />
            </div>
            <div className="text-xs text-white/60">
              {unluckiest.avgTrump.toFixed(2)} trump/hand · {unluckiest.rights} right bowers
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-white/55 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left py-1">Player</th>
              <th className="text-right py-1 px-2" title="Hands with a full 5-card play record">
                Hands
              </th>
              <th className="text-right py-1 px-2" title="Trump cards per hand (left bower counts as trump)">
                Trump/hand
              </th>
              <th
                className="text-right py-1 px-2"
                title={`Deviation from the fair share of ${EXPECTED_TRUMP_PER_HAND.toFixed(2)} trump per hand`}
              >
                Luck
              </th>
              <th className="text-right py-1 px-2" title="Right bowers dealt">
                Rights
              </th>
              <th className="text-right py-1 px-2" title="Left bowers dealt">
                Lefts
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-white/5">
                <td className="text-left py-1.5 font-medium">
                  <PlayerLink name={r.name} />
                </td>
                <td className="text-right py-1.5 px-2 tabular-nums">{r.hands}</td>
                <td className="text-right py-1.5 px-2 tabular-nums">{r.avgTrump.toFixed(2)}</td>
                <td className="text-right py-1.5 px-2 tabular-nums">
                  <span className={r.luck >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                    {r.luck >= 0 ? '+' : ''}
                    {r.luck.toFixed(2)}
                  </span>
                </td>
                <td className="text-right py-1.5 px-2 tabular-nums">{r.rights}</td>
                <td className="text-right py-1.5 px-2 tabular-nums">{r.lefts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-white/40 leading-snug">
        Reconstructed from cards actually played, so it’s an approximation: the dealer’s pickup
        replaces an unknown discard, and a loner’s sitting-out partner is skipped for that hand.
        Fair share is {EXPECTED_TRUMP_PER_HAND.toFixed(2)} trump per hand (7 of 24 cards, counting
        the left bower).
      </p>
    </div>
  );
}
