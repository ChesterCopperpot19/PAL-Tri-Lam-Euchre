'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import type { MatchRecord, PlayerAllTime, StatsPayload } from '@/lib/shared-types';

function pct(n: number, d: number): string {
  if (d === 0) return '—';
  return Math.round((n / d) * 100) + '%';
}

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

export default function StatsPage() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;
    const fetchStats = () =>
      socket.emit('stats:get', (payload) => {
        if (!cancelled) {
          setData(payload);
          setLoaded(true);
        }
      });
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const players: PlayerAllTime[] = data?.players ?? [];
  const matches: MatchRecord[] = data?.matches ?? [];

  return (
    <main className="min-h-screen px-4 py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">
            All-time stats
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-gold tracking-wide">
            PAL/Tri-Lam Euchre Club
          </h1>
        </div>
        <Link
          href="/"
          className="text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2"
        >
          ← Home
        </Link>
      </div>

      {!loaded ? (
        <div className="text-white/60">Loading stats…</div>
      ) : players.length === 0 ? (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-6 text-white/70">
          No completed games yet. Finish a game to 10 and it’ll show up here.
        </div>
      ) : (
        <>
          {/* All-time leaderboard */}
          <div className="bg-black/40 border border-white/10 rounded-2xl p-4 sm:p-5 mb-6 overflow-x-auto">
            <div className="text-xs uppercase tracking-wider text-white/60 mb-3">
              Player leaderboard · {data?.totalMatches ?? 0} games recorded
            </div>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-white/60 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="text-left py-1 pr-2">Player</th>
                  <th className="text-right py-1 px-1.5" title="Games played">GP</th>
                  <th className="text-right py-1 px-1.5" title="Games won">W</th>
                  <th className="text-right py-1 px-1.5" title="Win rate">Win%</th>
                  <th className="text-right py-1 px-1.5" title="Total tricks won">🏆</th>
                  <th className="text-right py-1 px-1.5" title="Hands called (became maker)">Called</th>
                  <th className="text-right py-1 px-1.5" title="Call success rate">Call%</th>
                  <th className="text-right py-1 px-1.5" title="Marches (5-trick sweeps when calling)">🌟</th>
                  <th className="text-right py-1 px-1.5" title="Times euchred when calling">❌</th>
                  <th className="text-right py-1 px-1.5" title="Loners called">🔥</th>
                  <th className="text-right py-1 pl-1.5" title="Loners made">🎯</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, idx) => (
                  <tr
                    key={p.name}
                    className={`border-t border-white/5 ${idx === 0 ? 'bg-gold/5' : ''}`}
                  >
                    <td className="text-left py-1.5 pr-2 font-medium">
                      {idx === 0 && <span className="mr-1">👑</span>}
                      {p.name}
                    </td>
                    <td className="text-right py-1.5 px-1.5">{p.games}</td>
                    <td className="text-right py-1.5 px-1.5">{p.wins}</td>
                    <td className="text-right py-1.5 px-1.5 text-gold">{pct(p.wins, p.games)}</td>
                    <td className="text-right py-1.5 px-1.5">{p.tricks}</td>
                    <td className="text-right py-1.5 px-1.5">{p.handsCalled}</td>
                    <td className="text-right py-1.5 px-1.5">{pct(p.callsWon, p.handsCalled)}</td>
                    <td className="text-right py-1.5 px-1.5">{p.marches}</td>
                    <td className="text-right py-1.5 px-1.5 text-red-300/90">{p.euchres}</td>
                    <td className="text-right py-1.5 px-1.5">{p.loneCalled}</td>
                    <td className="text-right py-1.5 pl-1.5">{p.loneWon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recent matches */}
          <div className="bg-black/40 border border-white/10 rounded-2xl p-4 sm:p-5">
            <div className="text-xs uppercase tracking-wider text-white/60 mb-3">
              Recent matches
            </div>
            <div className="space-y-2">
              {matches.map((m) => {
                const ns = m.players.filter((p) => p.team === 'NS').map((p) => p.name);
                const ew = m.players.filter((p) => p.team === 'EW').map((p) => p.name);
                const nsWon = m.winnerTeam === 'NS';
                return (
                  <div
                    key={m.id}
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
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
                      <div className="text-white/60 text-xs whitespace-nowrap">
                        {m.finalScore.NS}–{m.finalScore.EW}
                      </div>
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {formatDate(m.ts)} · {m.handsPlayed} hands
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-white/40 mt-4 leading-snug">
            Stats are recorded per completed game (first team to 10). Players are matched by
            display name, so use the same name each time to keep your history together.
          </p>
        </>
      )}
    </main>
  );
}
