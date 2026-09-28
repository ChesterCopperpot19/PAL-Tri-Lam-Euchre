'use client';
// Loads one recorded game plus its card-by-card hands. The two socket payloads
// are fetched once per page load and shared, so stepping between a game and its
// hands doesn't refetch.

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import type { HandsPayload, MatchRecord, StatsPayload } from '@/lib/shared-types';
import type { HandSummary } from '@/server/engine/types';

let statsP: Promise<StatsPayload> | null = null;
let handsP: Promise<HandsPayload> | null = null;
export const getStats = () =>
  (statsP ??= new Promise((resolve) => getSocket().emit('stats:get', resolve)));
export const getHands = () =>
  (handsP ??= new Promise((resolve) => getSocket().emit('stats:hands', resolve)));

export type GameRecord =
  | { status: 'loading' }
  | { status: 'missing' }
  | {
      status: 'ready';
      match: MatchRecord;
      /** Card-by-card hands, when the game was played in the app with tracking. */
      fullHands: HandSummary[] | null;
    };

export function useGameRecord(id: string): GameRecord {
  const [rec, setRec] = useState<GameRecord>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    (async () => {
      const stats = await getStats();
      const match = stats.matches.find((m) => m.id === id);
      if (!match) {
        if (alive) setRec({ status: 'missing' });
        return;
      }
      const hands = await getHands();
      const full = hands.games.find((g) => g.id === id)?.hands ?? null;
      if (alive) setRec({ status: 'ready', match, fullHands: full && full.length ? full : null });
    })();
    return () => {
      alive = false;
    };
  }, [id]);
  return rec;
}

/** Seat → player name for a recorded game. */
export function seatNames(match: MatchRecord): Record<number, string> {
  const out: Record<number, string> = { 0: 'South', 1: 'West', 2: 'North', 3: 'East' };
  for (const p of match.players) out[p.seat] = p.name;
  return out;
}

/** "Made it, +1 N/S" style result for one hand. */
export function handResult(h: HandSummary, names: Record<number, string>): string {
  const makerTeam = h.maker % 2 === 0 ? 'NS' : 'EW';
  const makerTricks = h.tricksByTeam[makerTeam];
  const pts = h.pointsAwarded.NS || h.pointsAwarded.EW;
  const team = h.pointsAwarded.NS ? teamLabel('NS', names) : teamLabel('EW', names);
  const how = h.euchred ? 'Euchred' : h.march ? (h.alone ? 'Lone march' : 'March') : `Made it (${makerTricks})`;
  return `${how} · +${pts} ${team}`;
}

export function teamLabel(team: 'NS' | 'EW', names: Record<number, string>): string {
  return team === 'NS' ? `${names[0]} & ${names[2]}` : `${names[1]} & ${names[3]}`;
}
