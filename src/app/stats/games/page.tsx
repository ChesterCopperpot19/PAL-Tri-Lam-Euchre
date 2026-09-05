'use client';
// Full games archive — every recorded game, grouped by session (game night),
// newest first, with the same date/source filters as the dashboard.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import type { MatchRecord, StatsPayload } from '@/lib/shared-types';
import { filterMatches, prepareGames } from '@/lib/stats-analytics';
import { clearAdminKey, getAdminKey } from '@/lib/stats-admin-key';
import { computeSessions, formatDuration } from '@/lib/stats-sessions';
import { sessionDateLabel } from '@/components/stats/SessionRecap';
import StatsFilters, {
  EMPTY_FILTERS,
  matchFilterFor,
  type StatsFilterState,
} from '@/components/stats/StatsFilters';
import GameRow from '@/components/stats/GameRow';
import PlayerLink from '@/components/stats/PlayerLink';

export default function GamesArchivePage() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [filters, setFilters] = useState<StatsFilterState>(EMPTY_FILTERS);

  // Same admin-key gate as the dashboard (server-side check is the real gate).
  const [adminKey, setAdminKey] = useState<string | null>(null);
  useEffect(() => {
    setAdminKey(getAdminKey());
  }, []);

  // Ignore socket acks that land after this page has unmounted.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(() => {
    getSocket().emit('stats:get', (payload) => {
      if (!alive.current) return;
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
      if (res.ok) {
        load();
        return;
      }
      if (res.code === 'auth') {
        clearAdminKey();
        setAdminKey(null);
        window.alert(`${res.error}\n\nThe saved key was cleared — unlock again from the dashboard.`);
      } else {
        window.alert(res.error);
      }
    });
  }

  const allMatches = useMemo<MatchRecord[]>(() => data?.matches ?? [], [data]);
  const matches = useMemo(() => filterMatches(allMatches, matchFilterFor(filters)), [allMatches, filters]);
  // Human-only filter runs once; computeSessions recognises the prepared list.
  const human = useMemo(() => prepareGames(matches), [matches]);
  const gameCount = human.length;
  // Newest session first, games within a session newest first.
  const sessions = useMemo(() => computeSessions(human).slice().reverse(), [human]);

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
      <StatsFilters value={filters} onChange={setFilters} className="mb-5" />

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
