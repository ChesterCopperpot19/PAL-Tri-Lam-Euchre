'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import type { MatchRecord, StatsPayload } from '@/lib/shared-types';
import {
  humanGames,
  computePlayers,
  computeDuos,
  computeHeadToHead,
  computeSuperlatives,
  sortPlayers,
  type SortKey,
} from '@/lib/stats-analytics';
import SuperlativeCards from '@/components/stats/SuperlativeCards';
import Leaderboard from '@/components/stats/Leaderboard';
import DuosSection from '@/components/stats/DuosSection';
import FrenemyTable from '@/components/stats/FrenemyTable';
import PartnershipHeatmap from '@/components/stats/PartnershipHeatmap';
import { WinPctChart, VolumeChart } from '@/components/stats/StatCharts';

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** A titled dashboard panel. */
function Section({
  title,
  children,
  right,
  note,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="bg-black/40 border border-white/10 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-gold font-semibold">{title}</h2>
          {note && <p className="text-[11px] text-white/45 mt-0.5">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function StatsPage() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Interactive controls.
  const [minGames, setMinGames] = useState(1); // leaderboard / efficiency qualification
  const [duoMin, setDuoMin] = useState(2); // min games together for best/worst duos
  const [sortKey, setSortKey] = useState<SortKey>('wins');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Charts render client-only (canvas), so gate them until after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    getSocket().emit('stats:get', (payload) => {
      setData(payload);
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function onDelete(id: string) {
    if (!window.confirm('Delete this game from the stats? This cannot be undone.')) return;
    getSocket().emit('stats:delete', { id }, (res) => {
      if (res.ok) load();
      else window.alert(res.error);
    });
  }

  const allMatches = useMemo<MatchRecord[]>(() => data?.matches ?? [], [data]);
  const human = useMemo(() => humanGames(allMatches), [allMatches]);
  const players = useMemo(() => computePlayers(allMatches), [allMatches]);
  const duos = useMemo(() => computeDuos(allMatches), [allMatches]);
  const h2h = useMemo(() => computeHeadToHead(allMatches), [allMatches]);
  const superlatives = useMemo(() => computeSuperlatives(players, minGames), [players, minGames]);

  const qualified = useMemo(() => players.filter((p) => p.games >= minGames), [players, minGames]);
  const sorted = useMemo(() => sortPlayers(qualified, sortKey, sortDir), [qualified, sortKey, sortDir]);

  const maxGames = useMemo(() => players.reduce((m, p) => Math.max(m, p.games), 0), [players]);
  const hiddenCount = players.length - qualified.length;

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  const recent = useMemo(
    () => human.slice().sort((a, b) => b.ts - a.ts).slice(0, 10),
    [human]
  );

  return (
    <main className="min-h-screen px-3 sm:px-4 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">Analytics</div>
          <h1 className="font-display text-3xl sm:text-4xl text-gold tracking-wide leading-tight">
            PAL/Tri-Lam Dashboard
          </h1>
          <p className="text-white/55 text-sm mt-1">
            {human.length} completed {human.length === 1 ? 'game' : 'games'} among four humans
            {data && data.totalMatches > human.length && (
              <span className="text-white/35">
                {' '}
                · {data.totalMatches - human.length} with bots (not counted)
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <Link
            href="/stats/log"
            className="text-sm bg-gold text-black font-semibold rounded-lg px-3 py-2 hover:brightness-110 whitespace-nowrap"
          >
            ✏️ Log a game
          </Link>
          <Link
            href="/"
            className="text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2"
          >
            ← Home
          </Link>
        </div>
      </div>

      {!loaded ? (
        <div className="text-white/60">Loading analytics…</div>
      ) : human.length === 0 ? (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-6 text-white/70 space-y-2">
          <p className="text-lg text-white/90">No fully-human games recorded yet.</p>
          <p className="text-sm">
            This dashboard only counts games where all four seats were real people. Finish a game
            with four humans (no bot fill-ins) and the standings, partnerships, rivalries, and charts
            will populate here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Superlatives */}
          <SuperlativeCards awards={superlatives} />

          {/* Controls */}
          <section className="bg-black/30 border border-white/10 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <div className="flex items-center justify-between text-xs text-white/70 mb-1">
                <span className="uppercase tracking-wider">Min games (rankings)</span>
                <span className="text-gold font-medium">{minGames}</span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(5, maxGames)}
                value={minGames}
                onChange={(e) => setMinGames(Number(e.target.value))}
                className="w-full accent-gold"
                aria-label="Minimum games to qualify for the leaderboard"
              />
              <div className="text-[11px] text-white/40 mt-0.5">
                Hide casual guests from win-% rankings
                {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
              </div>
            </label>
            <label className="block">
              <div className="flex items-center justify-between text-xs text-white/70 mb-1">
                <span className="uppercase tracking-wider">Min games together (duos)</span>
                <span className="text-gold font-medium">{duoMin}</span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(3, maxGames)}
                value={duoMin}
                onChange={(e) => setDuoMin(Number(e.target.value))}
                className="w-full accent-gold"
                aria-label="Minimum games together to qualify a partnership"
              />
              <div className="text-[11px] text-white/40 mt-0.5">
                Filters the best/worst partnership lists
              </div>
            </label>
          </section>

          {/* Leaderboard */}
          <Section title="Leaderboard" note="Tap any column to sort">
            {sorted.length === 0 ? (
              <p className="text-white/50 text-sm">
                No players with at least {minGames} games. Lower the “min games” slider.
              </p>
            ) : (
              <Leaderboard rows={sorted} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            )}
          </Section>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Section title="Win % ranking" note={`Players with ≥ ${minGames} games`}>
              {mounted && qualified.length > 0 ? (
                <WinPctChart players={qualified} />
              ) : (
                <p className="text-white/40 text-sm">Not enough qualifying players.</p>
              )}
            </Section>
            <Section title="Who shows up" note="Total games played">
              {mounted && players.length > 0 ? (
                <VolumeChart players={players} />
              ) : (
                <p className="text-white/40 text-sm">No games yet.</p>
              )}
            </Section>
          </div>

          {/* Partnership matrix */}
          <Section title="Partnership matrix" note="Win % when two players partner up">
            <PartnershipHeatmap players={players} duos={duos} />
          </Section>

          {/* Dynamic Duos */}
          <Section title="Dynamic Duos">
            <DuosSection duos={duos} minTogether={duoMin} />
          </Section>

          {/* Frenemies */}
          <Section
            title="Frenemies — head to head"
            note="Records when two players are on opposing teams"
          >
            <FrenemyTable rows={h2h} minMeetings={1} />
          </Section>

          {/* Recent matches */}
          <Section title="Recent games">
            <div className="space-y-2">
              {recent.map((m) => {
                const ns = m.players.filter((p) => p.team === 'NS').map((p) => p.name);
                const ew = m.players.filter((p) => p.team === 'EW').map((p) => p.name);
                const nsWon = m.winnerTeam === 'NS';
                return (
                  <div
                    key={m.id}
                    className="group bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={nsWon ? 'text-gold font-medium' : 'text-white/70'}>
                          {ns.join(' & ')} {nsWon && '👑'}
                        </span>
                        <span className="text-white/40">vs</span>
                        <span className={!nsWon ? 'text-gold font-medium' : 'text-white/70'}>
                          {ew.join(' & ')} {!nsWon && '👑'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-white/60 text-xs whitespace-nowrap">
                          {m.finalScore.NS}–{m.finalScore.EW}
                        </span>
                        <button
                          onClick={() => onDelete(m.id)}
                          aria-label="Delete this game"
                          title="Delete this game"
                          className="text-white/30 hover:text-red-300 px-1 sm:opacity-0 sm:group-hover:opacity-100 transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5 flex items-center gap-1.5">
                      <span>
                        {formatDate(m.ts)} · {m.handsPlayed} hands
                      </span>
                      {m.source === 'manual' && (
                        <span className="text-[10px] uppercase tracking-wider bg-white/10 border border-white/15 rounded px-1 py-0.5">
                          ✏️ in person
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <p className="text-[11px] text-white/40 leading-snug">
            Only games played by four humans count — bot fill-ins are excluded. Players are matched by
            display name, so use the same name each time to keep your history together. Win % on a
            handful of games is noisy; use the “min games” slider to focus on the regulars.
          </p>
        </div>
      )}
    </main>
  );
}
