'use client';
// The dashboard's data layer: loads every game, applies the date/source filters,
// and derives the shared stats (players, duos, head-to-head, Elo, badges, clutch,
// sessions) once per change. Also holds the admin unlock for deleting games; the
// real gate is on the server, this is just UX.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import type { MatchRecord, StatsPayload } from '@/lib/shared-types';
import { prepareGames, computePlayers, computeDuos, computeHeadToHead, filterMatches } from '@/lib/stats-analytics';
import { computeElo, mostImproved } from '@/lib/stats-elo';
import { computeBadges } from '@/lib/stats-achievements';
import { computeClutch } from '@/lib/stats-clutch';
import { computeSessions } from '@/lib/stats-sessions';
import { clearAdminKey, getAdminKey, promptAdminKey } from '@/lib/stats-admin-key';
import { matchFilterFor, type StatsFilterState } from './StatsFilters';

export function useStatsData(filters: StatsFilterState) {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Kept in sessionStorage (see stats-admin-key.ts) so an admin enters it once
  // per tab; delete controls stay hidden until unlocked.
  const [adminKey, setAdminKey] = useState<string | null>(null);
  useEffect(() => {
    setAdminKey(getAdminKey());
  }, []);

  // Ignore socket acks that land after the page has unmounted.
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

  function unlockAdmin() {
    const k = promptAdminKey('Enter the stats admin key to enable deleting games:');
    if (k) setAdminKey(k);
  }
  function lockAdmin() {
    clearAdminKey();
    setAdminKey(null);
  }
  function onDelete(id: string) {
    if (!adminKey) return; // delete controls are hidden while locked
    if (!window.confirm('Delete this game from the stats? This cannot be undone.')) return;
    getSocket().emit('stats:delete', { id, key: adminKey }, (res) => {
      if (res.ok) {
        load();
        return;
      }
      if (res.code === 'auth') {
        lockAdmin();
        window.alert(`${res.error}\n\nThe saved key was cleared — click “Admin” to re-enter it.`);
      } else {
        window.alert(res.error);
      }
    });
  }

  const allMatches = useMemo<MatchRecord[]>(() => data?.matches ?? [], [data]);
  // Apply the date/source filters before computing anything.
  const matches = useMemo(() => filterMatches(allMatches, matchFilterFor(filters)), [allMatches, filters]);
  // Run the human-only filter + name canonicalization ONCE per history change;
  // every compute function recognises the prepared array and skips its own pass.
  const human = useMemo(() => prepareGames(matches), [matches]);
  const players = useMemo(() => computePlayers(human), [human]);
  const duos = useMemo(() => computeDuos(human), [human]);
  const h2h = useMemo(() => computeHeadToHead(human), [human]);
  const elo = useMemo(() => computeElo(human), [human]);
  const badges = useMemo(() => computeBadges(human, players, elo), [human, players, elo]);
  const improved = useMemo(() => mostImproved(elo), [elo]);
  const clutch = useMemo(() => computeClutch(human), [human]);
  const sessions = useMemo(() => computeSessions(human), [human]);
  const lastSession = sessions.length ? sessions[sessions.length - 1] : null;

  return {
    data,
    loaded,
    adminKey,
    unlockAdmin,
    lockAdmin,
    onDelete,
    human,
    players,
    duos,
    h2h,
    elo,
    badges,
    improved,
    clutch,
    lastSession,
  };
}
