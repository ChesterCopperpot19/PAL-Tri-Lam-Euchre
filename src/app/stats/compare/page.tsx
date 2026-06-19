'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import type { MatchRecord, StatsPayload } from '@/lib/shared-types';
import { computePlayers, type PlayerRow } from '@/lib/stats-analytics';
import { computeElo } from '@/lib/stats-elo';
import { computeRadar, type RadarAxes } from '@/lib/stats-profile';
import { RadarCompare } from '@/components/stats/ProfileCharts';
import PlayerLink from '@/components/stats/PlayerLink';

const LEAGUE = '__league__';
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const one = (n: number) => n.toFixed(1);

type Entity = {
  label: string;
  rating: number;
  games: number;
  winPct: number;
  ppgFor: number;
  pointDiff: number;
  callPct: number;
  marches: number;
  loneWon: number;
  currentStreak: number;
  radar: RadarAxes;
};

const ROWS: { key: keyof Entity; label: string; fmt: (n: number) => string; higherBetter: boolean }[] = [
  { key: 'rating', label: 'Elo', fmt: (n) => `${Math.round(n)}`, higherBetter: true },
  { key: 'games', label: 'Games', fmt: (n) => `${Math.round(n)}`, higherBetter: true },
  { key: 'winPct', label: 'Win %', fmt: pct, higherBetter: true },
  { key: 'ppgFor', label: 'PPG', fmt: one, higherBetter: true },
  { key: 'pointDiff', label: 'Point diff', fmt: (n) => `${n >= 0 ? '+' : ''}${one(n)}`, higherBetter: true },
  { key: 'callPct', label: 'Call %', fmt: pct, higherBetter: true },
  { key: 'marches', label: 'Marches', fmt: (n) => `${Math.round(n)}`, higherBetter: true },
  { key: 'loneWon', label: 'Loners made', fmt: (n) => `${Math.round(n)}`, higherBetter: true },
];

export default function ComparePage() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState(LEAGUE);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;
    socket.emit('stats:get', (payload) => {
      if (!cancelled) {
        setData(payload);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allMatches = useMemo<MatchRecord[]>(() => data?.matches ?? [], [data]);
  const players = useMemo(() => computePlayers(allMatches), [allMatches]);
  const elo = useMemo(() => computeElo(allMatches), [allMatches]);
  const radar = useMemo(() => computeRadar(players), [players]);
  const names = useMemo(() => players.map((p) => p.name).sort((x, y) => x.localeCompare(y)), [players]);

  // Default A to the first player once data loads.
  useEffect(() => {
    if (!a && names.length) setA(names[0]);
  }, [a, names]);

  const leagueRadar = useMemo<RadarAxes>(() => {
    const vals = [...radar.values()].map((r) => r.scaled);
    return {
      maker: mean(vals.map((v) => v.maker)),
      defense: mean(vals.map((v) => v.defense)),
      loner: mean(vals.map((v) => v.loner)),
      consistency: mean(vals.map((v) => v.consistency)),
      aggression: mean(vals.map((v) => v.aggression)),
    };
  }, [radar]);

  const entity = (sel: string): Entity | null => {
    if (sel === LEAGUE) {
      return {
        label: 'League avg',
        rating: mean(players.map((p) => elo.get(p.name)?.rating ?? 1500)),
        games: mean(players.map((p) => p.games)),
        winPct: mean(players.map((p) => p.winPct)),
        ppgFor: mean(players.map((p) => p.ppgFor)),
        pointDiff: mean(players.map((p) => p.pointDiff)),
        callPct: mean(players.map((p) => p.callPct)),
        marches: mean(players.map((p) => p.marches)),
        loneWon: mean(players.map((p) => p.loneWon)),
        currentStreak: 0,
        radar: leagueRadar,
      };
    }
    const p = players.find((pl) => pl.name === sel);
    if (!p) return null;
    return {
      label: p.name,
      rating: elo.get(p.name)?.rating ?? 1500,
      games: p.games,
      winPct: p.winPct,
      ppgFor: p.ppgFor,
      pointDiff: p.pointDiff,
      callPct: p.callPct,
      marches: p.marches,
      loneWon: p.loneWon,
      currentStreak: p.currentStreak,
      radar: radar.get(p.name)?.scaled ?? leagueRadar,
    };
  };

  const ea = entity(a);
  const eb = entity(b);

  const Select = ({ value, onChange, allowLeague }: { value: string; onChange: (v: string) => void; allowLeague: boolean }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2.5 outline-none focus:border-gold text-white"
    >
      {allowLeague && <option value={LEAGUE}>🏆 League average</option>}
      {names.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );

  return (
    <main className="min-h-screen px-3 sm:px-4 py-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">Compare</div>
          <h1 className="font-display text-3xl sm:text-4xl text-gold tracking-wide leading-tight">Head to head</h1>
        </div>
        <Link href="/stats" className="shrink-0 text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2">
          ← Dashboard
        </Link>
      </div>

      {!loaded ? (
        <div className="text-white/60">Loading…</div>
      ) : players.length < 2 ? (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-6 text-white/70">
          Need at least two players with recorded games to compare.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select value={a} onChange={setA} allowLeague={false} />
            <Select value={b} onChange={setB} allowLeague />
          </div>

          {ea && eb && (
            <>
              <section className="bg-black/40 border border-white/10 rounded-2xl p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/55 text-[10px] uppercase tracking-wider">
                      <th className="text-left py-1" />
                      <th className="text-right py-1 px-2 text-gold">
                        {a === LEAGUE ? ea.label : <PlayerLink name={ea.label} />}
                      </th>
                      <th className="text-right py-1 px-2" style={{ color: '#7aa2ff' }}>
                        {b === LEAGUE ? eb.label : <PlayerLink name={eb.label} />}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row) => {
                      const va = ea[row.key] as number;
                      const vb = eb[row.key] as number;
                      const aWins = row.higherBetter ? va > vb : va < vb;
                      const bWins = row.higherBetter ? vb > va : vb < va;
                      return (
                        <tr key={row.key} className="border-t border-white/5">
                          <td className="text-left py-1.5 text-white/60">{row.label}</td>
                          <td className={`text-right py-1.5 px-2 tabular-nums ${aWins ? 'text-gold font-semibold' : 'text-white/85'}`}>
                            {row.fmt(va)}
                          </td>
                          <td className={`text-right py-1.5 px-2 tabular-nums ${bWins ? 'font-semibold' : 'text-white/85'}`} style={bWins ? { color: '#7aa2ff' } : undefined}>
                            {row.fmt(vb)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              <section className="bg-black/40 border border-white/10 rounded-2xl p-4">
                <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">Play style</h2>
                {mounted ? (
                  <RadarCompare a={ea.radar} b={eb.radar} labelA={ea.label} labelB={eb.label} />
                ) : (
                  <p className="text-white/40 text-sm">Loading chart…</p>
                )}
                <p className="text-[11px] text-white/40 mt-1">Axes scaled relative to the club.</p>
              </section>
            </>
          )}
        </div>
      )}
    </main>
  );
}
