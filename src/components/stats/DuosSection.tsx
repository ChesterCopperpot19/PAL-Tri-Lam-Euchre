'use client';
import type { DuoRow } from '@/lib/stats-analytics';
import PlayerLink from './PlayerLink';

const pct = (n: number) => `${Math.round(n * 100)}%`;

function DuoLine({ d, rank }: { d: DuoRow; rank: number }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-t border-white/5 first:border-t-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-white/40 text-xs w-4 text-right tabular-nums">{rank}</span>
        <span className="text-sm text-white/90 truncate" title={`${d.a} & ${d.b}`}>
          <PlayerLink name={d.a} /> <span className="text-white/40">&amp;</span>{' '}
          <PlayerLink name={d.b} />
        </span>
      </div>
      <div className="text-xs whitespace-nowrap">
        <span className="text-gold font-medium">{pct(d.winPct)}</span>
        <span className="text-white/50">
          {' '}
          · {d.wins}–{d.losses}
        </span>
      </div>
    </div>
  );
}

function Panel({ title, hint, rows }: { title: string; hint: string; rows: DuoRow[] }) {
  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-3 sm:p-4">
      <div className="text-xs uppercase tracking-wider text-gold/90 font-semibold">{title}</div>
      <div className="text-[11px] text-white/45 mb-1.5">{hint}</div>
      {rows.length === 0 ? (
        <div className="text-white/40 text-sm py-2">Not enough games yet.</div>
      ) : (
        rows.map((d, i) => <DuoLine key={d.key} d={d} rank={i + 1} />)
      )}
    </div>
  );
}

/**
 * Dynamic Duos: best/worst partnerships (gated on games-together so a one-off
 * pairing can't top the chart) and the pairs that play together most.
 */
export default function DuosSection({
  duos,
  minTogether,
}: {
  duos: DuoRow[];
  minTogether: number;
}) {
  const qualified = duos.filter((d) => d.games >= minTogether);
  const byWin = (dir: 1 | -1) =>
    qualified
      .slice()
      .sort((a, b) => (b.winPct - a.winPct) * dir || b.games - a.games)
      .slice(0, 5);
  const best = byWin(1);
  const worst = byWin(-1);
  const frequent = duos.slice().sort((a, b) => b.games - a.games || b.winPct - a.winPct).slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Panel title="🏆 Best Duos" hint={`Top win % · min ${minTogether} games together`} rows={best} />
      <Panel title="💀 Struggle Bus" hint={`Lowest win % · min ${minTogether} games together`} rows={worst} />
      <Panel title="🤝 Inseparable" hint="Most games played together" rows={frequent} />
    </div>
  );
}
