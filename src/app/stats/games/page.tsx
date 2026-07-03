'use client';
// Full games archive — every recorded game, grouped by session (game night),
// newest first, with the same date/source filters as the dashboard.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import type { MatchRecord, StatsPayload } from '@/lib/shared-types';
import { filterMatches, humanGames } from '@/lib/stats-analytics';
import { computeSessions, formatDuration } from '@/lib/stats-sessions';
import { sessionDateLabel } from '@/components/stats/SessionRecap';
import GameRow from '@/components/stats/GameRow';
import PlayerLink from '@/components/stats/PlayerLink';

export default function GamesArchivePage() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [source, setSource] = useState<'all' | 'app' | 'manual' | 'historical'>('all');

  // Same admin-key gate as the dashboard (server-side check is the real gate).
  const [adminKey, setAdminKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      setAdminKey(localStorage.getItem('euchre_admin_key'));
    } catch {
      /* stays locked */
    }
  }, []);

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
    if (!adminKey) return;
    if (!window.confirm('Delete this game from the stats? This cannot be undone.')) return;
    getSocket().emit('stats:delete', { id, key: adminKey }, (res) => {
      if (res.ok) load();
      else window.alert(res.error);
    });
  }

  const allMatches = useMemo<MatchRecord[]>(() => data?.matches ?? [], [data]);
  const matches = useMemo(
    () =>
      filterMatches(allMatches, {
        from: dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : undefined,
        to: dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : undefined,
        source: source === 'all' ? undefined : source,
      }),
    [allMatches, dateFrom, dateTo, source]
  );
  const gameCount = useMemo(() => humanGames(matches).length, [matches]);
  // Newest session first, games within a session newest first.
  const sessions = useMemo(() => computeSessions(matches).slice().reverse(), [matches]);

  return (
    <main className="min-h-screen px-3 sm:px-4 py-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">Archive</div>
          <h1 className="font-display text-3xl sm:text-4xl text-gold tracking-wide leading-tight">
            All Games
          </h1>
          <p className="text-white/55 text-sm mt-1">
            {gameCount} game{gameCount === 1 ? '' : 's'} across {sessions.length} session
            {sessions.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/stats"
          className="shrink-0 text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2"
        >
          ← Dashboard
        </Link>
      </div>

      {/* Filters */}
      <section className="bg-black/30 border border-white/10 rounded-2xl p-4 flex flex-wrap items-end gap-3 mb-5">
        <label className="text-xs text-white/60">
          <span className="uppercase tracking-wider block mb-1">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 outline-none focus:border-gold text-white"
          />
        </label>
        <label className="text-xs text-white/60">
          <span className="uppercase tracking-wider block mb-1">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 outline-none focus:border-gold text-white"
          />
        </label>
        <label className="text-xs text-white/60">
          <span className="uppercase tracking-wider block mb-1">Games</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as 'all' | 'app' | 'manual' | 'historical')}
            className="bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 outline-none focus:border-gold text-white"
          >
            <option value="all">All</option>
            <option value="app">Online</option>
            <option value="manual">In person</option>
            <option value="historical">Historical</option>
          </select>
        </label>
        {(dateFrom || dateTo || source !== 'all') && (
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setSource('all');
            }}
            className="text-xs text-white/60 hover:text-white border border-white/15 rounded-lg px-2.5 py-1.5"
          >
            Clear filters
          </button>
        )}
      </section>

      {!loaded ? (
        <div className="text-white/60">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-6 text-white/70">
          No four-human games match these filters.
        </div>
      ) : (
        <div className="space-y-5">
          {sessions.map((s) => (
            <section key={s.id} className="bg-black/40 border border-white/10 rounded-2xl p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <h2 className="text-sm uppercase tracking-wider text-gold font-semibold">
                  {sessionDateLabel(s)}
                </h2>
                <span className="text-[11px] text-white/45">
                  {s.games.length} game{s.games.length === 1 ? '' : 's'} · {s.handsTotal} hands
                  {s.durationMs != null && ` · ${formatDuration(s.durationMs)}`}
                </span>
              </div>
              <p className="text-[11px] text-white/50 mb-3">
                🏆{' '}
                {s.champions.map((n, i) => (
                  <span key={n}>
                    {i > 0 && ' & '}
                    <PlayerLink name={n} />
                  </span>
                ))}{' '}
                took the night
                {s.records[0] && ` (${s.records[0].wins}–${s.records[0].losses})`}
                {' · '}
                {s.records
                  .map((r) => `${r.name} ${r.wins}–${r.losses}`)
                  .join(' · ')}
              </p>
              <div className="space-y-2">
                {s.games
                  .slice()
                  .reverse()
                  .map((m) => (
                    <GameRow key={m.id} match={m} onDelete={adminKey ? onDelete : undefined} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
