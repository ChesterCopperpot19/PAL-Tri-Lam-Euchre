'use client';
// The default `stats:get` payload ships hands WITHOUT the heavy per-card
// bids/tricks. Panels that need them (hand explorer, dealer analytics, luck
// index) call this hook when they mount: it fetches the full detail once via
// `stats:hands` and merges it back into the (already filtered) matches by id.

import { useEffect, useMemo, useState } from 'react';
import type { MatchRecord } from '@/lib/shared-types';
import type { HandSummary } from '@/server/engine/types';
import { getSocket } from '@/lib/socket-client';

export function useFullHands(matches: MatchRecord[]): {
  detailed: MatchRecord[];
  loading: boolean;
} {
  const [fullById, setFullById] = useState<Map<string, HandSummary[]> | null>(null);
  useEffect(() => {
    let alive = true;
    getSocket().emit('stats:hands', (payload) => {
      if (!alive) return;
      const map = new Map<string, HandSummary[]>();
      for (const g of payload.games) map.set(g.id, g.hands);
      setFullById(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  const detailed = useMemo(
    () =>
      fullById
        ? matches.map((m) => (fullById.has(m.id) ? { ...m, hands: fullById.get(m.id) } : m))
        : matches,
    [matches, fullById]
  );
  return { detailed, loading: fullById === null };
}
