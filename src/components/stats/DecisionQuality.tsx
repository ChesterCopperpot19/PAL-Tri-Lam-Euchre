'use client';
// Dashboard panel: every player's card decisions graded on what they could see
// at the time, ranked by expected points given up per 100 decisions (worst
// first), each with a ~95% range so small samples don't read as verdicts. The
// table underneath carries every number, so nothing depends on the chart alone.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchRecord } from '@/lib/shared-types';
import { nameKey } from '@/lib/stats-analytics';
import { aggregate, pointsLostPer100, type DecisionStats } from '@/lib/solver/decisions';
import { useGradedGames } from './useGradedGames';

/** Players need this many graded decisions to be ranked. */
const MIN_DECISIONS = 100;

// Single series on the chart surface; validated with the dataviz palette checker
// (same values as the replay's swing chart).
const DOT = '#5F8FF0';
const SURFACE = '#0E1638';

type Row = { name: string; stats: DecisionStats; lost: { mean: number; lo: number; hi: number } };

export default function DecisionQuality({ games }: { games: MatchRecord[] }) {
  const { withCards, graded, progress } = useGradedGames(games);

  const data = useMemo(() => {
    if (!graded || !withCards) return null;
    // Group each player's seats across games (case-insensitive names).
    const byPlayer = new Map<string, { name: string; games: { gameId: string; hands: NonNullable<ReturnType<typeof graded.get>>; seats: number[] }[] }>();
    const club = [];
    for (const g of withCards) {
      const hands = graded.get(g.id);
      const m = games.find((x) => x.id === g.id);
      if (!hands || !m) continue;
      const humans = m.players.filter((p) => !p.isBot);
      club.push({ gameId: g.id, hands, seats: humans.map((p) => p.seat as number) });
      for (const p of humans) {
        const k = nameKey(p.name);
        const e = byPlayer.get(k) ?? { name: p.name, games: [] };
        e.games.push({ gameId: g.id, hands, seats: [p.seat] });
        byPlayer.set(k, e);
      }
    }
    const rows: Row[] = [...byPlayer.values()].map((p) => {
      const stats = aggregate(p.games).stats;
      return { name: p.name, stats, lost: pointsLostPer100(stats) };
    });
    const ranked = rows.filter((r) => r.stats.decisions >= MIN_DECISIONS).sort((a, b) => b.lost.mean - a.lost.mean);
    const unranked = rows.filter((r) => r.stats.decisions < MIN_DECISIONS && r.stats.decisions > 0);
    const clubStats = aggregate(club).stats;
    return { ranked, unranked, club: pointsLostPer100(clubStats), clubStats };
  }, [graded, withCards, games]);

  if (!data) {
    return (
      <div className="text-sm text-white/70">
        {progress && progress.total > 0 ? (
          <>
            <p>
              Grading every card played in the app… {progress.done} of {progress.total} hands
            </p>
            <div
              className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
            >
              <div className="h-full bg-gold" style={{ width: `${(100 * progress.done) / progress.total}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-white/45">This happens once; your browser keeps the results.</p>
          </>
        ) : (
          <p>Loading the club’s games…</p>
        )}
      </div>
    );
  }
  if (data.ranked.length === 0) {
    return <p className="text-sm text-white/60">Not enough app-played games in this view yet.</p>;
  }

  const worst = data.ranked[0];
  const best = data.ranked[data.ranked.length - 1];
  // Do the extremes' ranges overlap? Then say so rather than overclaim.
  const clearGap = worst.lost.lo > best.lost.hi;

  return (
    <div>
      <p className="text-sm text-white/85 mb-3">
        Most points thrown away: <strong className="text-white">{worst.name}</strong> ({worst.lost.mean.toFixed(1)} per 100
        decisions). Sharpest: <strong className="text-white">{best.name}</strong> ({best.lost.mean.toFixed(1)}).
        <span className="text-white/55">
          {clearGap
            ? ' The gap between them is bigger than the noise.'
            : ' Their ranges still overlap, so more games could reorder them.'}
        </span>
      </p>

      <RankChart rows={data.ranked} club={data.club.mean} />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Decision quality by player, most points lost first</caption>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/50 text-right">
              <th className="text-left font-medium py-1.5 pr-2">Player</th>
              <th className="font-medium px-2 hidden sm:table-cell">Decisions</th>
              <th className="font-medium px-2">Sound</th>
              <th className="font-medium px-2">Mistakes /100</th>
              <th className="font-medium px-2">Points lost /100</th>
              <th className="font-medium pl-2">Unlucky</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.ranked.map((r) => (
              <tr key={r.name} className="border-t border-white/10 text-right text-white/85">
                <td className="text-left py-1.5 pr-2">
                  <Link href={`/stats/player/${encodeURIComponent(r.name)}`} className="hover:text-gold hover:underline underline-offset-2">
                    {r.name}
                  </Link>
                </td>
                <td className="px-2 hidden sm:table-cell">{r.stats.decisions}</td>
                <td className="px-2">{Math.round((100 * r.stats.sound) / r.stats.decisions)}%</td>
                <td className="px-2">{((100 * r.stats.mistakes) / r.stats.decisions).toFixed(1)}</td>
                <td className="px-2 whitespace-nowrap">
                  {r.lost.mean.toFixed(1)}{' '}
                  <span className="text-white/45 text-xs hidden sm:inline">({r.lost.lo.toFixed(1)}–{r.lost.hi.toFixed(1)})</span>
                </td>
                <td className="pl-2">
                  {r.stats.unlucky}
                  <span className="text-white/45 text-xs"> of {r.stats.hindsightMisplays}</span>
                </td>
              </tr>
            ))}
            <tr className="border-t border-white/20 text-right text-white/60">
              <td className="text-left py-1.5 pr-2">Club</td>
              <td className="px-2 hidden sm:table-cell">{data.clubStats.decisions}</td>
              <td className="px-2">{Math.round((100 * data.clubStats.sound) / data.clubStats.decisions)}%</td>
              <td className="px-2">{((100 * data.clubStats.mistakes) / data.clubStats.decisions).toFixed(1)}</td>
              <td className="px-2">{data.club.mean.toFixed(1)}</td>
              <td className="pl-2">
                {data.clubStats.unlucky}
                <span className="text-xs"> of {data.clubStats.hindsightMisplays}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-white/45 leading-relaxed">
        Each card is graded on what the player could see when they chose it: over hundreds of deals consistent with
        their cards, the cards played and the voids shown, how many points each legal card was worth on average.
        “Points lost” is the gap to the best card; a mistake is a gap clearly over 0.1. “Unlucky” counts plays that
        gave away a trick with every card visible but were the right call. Bidding isn’t graded yet. Ranges are about
        95%.
        {data.unranked.length > 0 && ` Fewer than ${MIN_DECISIONS} decisions so far: ${data.unranked.map((r) => r.name).join(', ')}.`}
      </p>
    </div>
  );
}

/** Dot-and-range chart, worst first, with the club average as a reference line. */
function RankChart({ rows, club }: { rows: Row[]; club: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ROW = 30;
  const PAD = { top: 22, right: 44, bottom: 26, left: Math.min(120, Math.max(80, w * 0.24)) };
  const H = PAD.top + rows.length * ROW + PAD.bottom;
  const max = Math.max(club, ...rows.map((r) => r.lost.hi)) * 1.1 || 1;
  const step = max > 8 ? 2 : max > 4 ? 1 : 0.5;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const x = (v: number) => PAD.left + (v / max) * (w - PAD.left - PAD.right);
  const y = (i: number) => PAD.top + i * ROW + ROW / 2;
  const shown = hover !== null ? rows[hover] : null;

  return (
    <div ref={wrap}>
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={`Points lost per 100 decisions, most first: ${rows.map((r) => `${r.name} ${r.lost.mean.toFixed(1)}`).join(', ')}. Club average ${club.toFixed(1)}.`}
        className="block"
        onPointerLeave={() => setHover(null)}
      >
        <rect x="0" y="0" width={w} height={H} rx="10" fill={SURFACE} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={PAD.top - 6} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.07)" />
            <text x={x(t)} y={H - 9} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.55)">
              {t % 1 ? t.toFixed(1) : t}
            </text>
          </g>
        ))}
        {/* Club average reference line. */}
        <line x1={x(club)} x2={x(club)} y1={PAD.top - 8} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.4)" />
        <text x={x(club)} y={PAD.top - 11} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.7)">
          club {club.toFixed(1)}
        </text>
        {rows.map((r, i) => (
          <g key={r.name} onPointerEnter={() => setHover(i)}>
            {/* Row-sized hit target, bigger than the mark. */}
            <rect x={0} y={y(i) - ROW / 2} width={w} height={ROW} fill={hover === i ? 'rgba(255,255,255,0.05)' : 'transparent'} />
            <text x={PAD.left - 10} y={y(i) + 4} textAnchor="end" fontSize="12" fill="rgba(255,255,255,0.88)">
              {r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name}
            </text>
            <line x1={x(r.lost.lo)} x2={x(r.lost.hi)} y1={y(i)} y2={y(i)} stroke={DOT} strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
            <circle cx={x(r.lost.mean)} cy={y(i)} r="5" fill={DOT} stroke={SURFACE} strokeWidth="2" />
            <text x={x(r.lost.hi) + 6} y={y(i) + 4} fontSize="11" fill="rgba(255,255,255,0.7)">
              {r.lost.mean.toFixed(1)}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-1.5 text-xs min-h-[1.25rem]" aria-live="polite">
        {shown ? (
          <>
            <span className="text-white font-semibold">{shown.lost.mean.toFixed(1)} points lost per 100</span>
            <span className="text-white/60">
              {' '}
              · {shown.name} · range {shown.lost.lo.toFixed(1)}–{shown.lost.hi.toFixed(1)} · {shown.stats.decisions} decisions ·{' '}
              {shown.stats.mistakes} mistake{shown.stats.mistakes === 1 ? '' : 's'}
            </span>
          </>
        ) : (
          <span className="text-white/50">Expected points given up per 100 card decisions · dot = average, line = ~95% range · lower is better</span>
        )}
      </div>
    </div>
  );
}
