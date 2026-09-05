'use client';
// Dealer-position analytics: the measured dealer advantage, each player's call
// rate by seat relative to the dealer, and stick-the-dealer outcomes. Needs the
// full bid log for stuck detection, so it loads the heavy hand detail on mount.

import { useMemo } from 'react';
import type { MatchRecord } from '@/lib/shared-types';
import { computeDealerStats, POSITION_LABELS } from '@/lib/stats-hands';
import { useFullHands } from './useFullHands';
import PlayerLink from './PlayerLink';
import { pct } from '@/lib/stats-format';

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-black/30 border border-white/10 rounded-xl p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="font-display text-xl text-gold leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-white/45 mt-0.5">{sub}</div>}
    </div>
  );
}

const POSITION_TITLES = [
  'The dealer (picks up the up-card if ordered)',
  'Left of the dealer — eldest hand, bids and leads first',
  'Across from the dealer (dealer’s partner)',
  'Right of the dealer',
];

export default function DealerAnalytics({ matches }: { matches: MatchRecord[] }) {
  const { detailed, loading } = useFullHands(matches);
  const stats = useMemo(() => computeDealerStats(detailed), [detailed]);

  if (stats.handsWithDealer === 0) {
    return (
      <p className="text-white/45 text-sm">
        No dealer data yet — this fills in from games recorded after hand-level tracking went live.
      </p>
    );
  }

  const dealerWinRate = stats.dealerTeamWon / stats.handsWithDealer;
  const dealerNetPerHand = stats.dealerTeamNet / stats.handsWithDealer;
  const tint = (rate: number) => `rgba(255,184,28,${Math.min(0.85, rate * 1.6).toFixed(3)})`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Stat
          label="Dealing team wins hand"
          value={pct(dealerWinRate)}
          sub={`${stats.dealerTeamWon} of ${stats.handsWithDealer} hands`}
        />
        <Stat
          label="Dealing team net pts / hand"
          value={
            <span className={dealerNetPerHand >= 0 ? 'text-emerald-300' : 'text-red-300'}>
              {dealerNetPerHand >= 0 ? '+' : ''}
              {dealerNetPerHand.toFixed(2)}
            </span>
          }
          sub="above 0 = real dealer advantage"
        />
        <Stat
          label="Stuck dealers"
          value={
            !stats.stuckDetectable && loading
              ? '…'
              : stats.stuck.count
          }
          sub={
            stats.stuck.count
              ? `${stats.stuck.made} made · ${stats.stuck.euchred} euchred · net ${
                  stats.stuck.net >= 0 ? '+' : ''
                }${stats.stuck.net}`
              : loading
                ? 'loading bid logs…'
                : 'forced round-2 calls (all others passed)'
          }
        />
      </div>

      <div>
        <div className="text-[11px] text-white/45 mb-1.5">
          Call rate by seat relative to the dealer — how often each player names trump from each
          position (darker = calls more)
        </div>
        <div className="overflow-x-auto">
          <table className="border-separate text-sm" style={{ borderSpacing: 2 }}>
            <thead className="text-white/60 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="sticky left-0 z-10 bg-black/40 text-left pr-2">Player</th>
                {POSITION_LABELS.map((label, i) => (
                  <th key={label} className="w-16 text-center" title={POSITION_TITLES[i]}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.positions.map((p) => (
                <tr key={p.name}>
                  <th className="sticky left-0 z-10 bg-black/40 text-left pr-2 font-medium whitespace-nowrap max-w-[110px] truncate">
                    <PlayerLink name={p.name} />
                  </th>
                  {POSITION_LABELS.map((label, i) => {
                    const rate = p.hands[i] ? p.calls[i] / p.hands[i] : 0;
                    return (
                      <td
                        key={label}
                        className="w-16 h-9 text-center rounded tabular-nums text-white/90 text-xs leading-none"
                        style={{ background: tint(rate) }}
                        title={`${p.name} at ${label}: called ${p.calls[i]} of ${p.hands[i]} hands (${pct(rate)})`}
                      >
                        {p.hands[i] ? pct(rate) : '·'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
