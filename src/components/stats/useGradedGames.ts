'use client';
// Loads the club's card-by-card hands and grades every decision in them (in Web
// Workers, cached per game). Shared by the profile Decisions tab and the
// dashboard's decision-quality chart.

import { useEffect, useMemo, useState } from 'react';
import type { MatchRecord } from '@/lib/shared-types';
import type { HandSummary } from '@/server/engine/types';
import { getHands } from '@/components/analyzer/useGameRecord';
import { useDecisions } from '@/lib/solver/useDecisions';

export function useGradedGames(games: MatchRecord[], enabled = true) {
  const [full, setFull] = useState<Map<string, HandSummary[]> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getHands().then((p) => alive && setFull(new Map(p.games.map((g) => [g.id, g.hands]))));
    return () => {
      alive = false;
    };
  }, [enabled]);
  const withCards = useMemo(
    () =>
      full
        ? games
            .filter((m) => full.get(m.id)?.some((h) => h.tricks?.length))
            .map((m) => ({ id: m.id, hands: full.get(m.id)! }))
        : null,
    [games, full],
  );
  const { graded, progress } = useDecisions(withCards);
  return { withCards, graded, progress };
}
