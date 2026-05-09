import type { RoomMember } from './shared-types';
import type { SeatIndex, Team } from '@/server/engine/types';
import { TEAM_OF } from '@/server/engine/types';

/** "Alex & Hazel" — names of the two players on a team, or a fallback if a seat is empty. */
export function teamName(members: RoomMember[], team: Team): string {
  const seats: SeatIndex[] = team === 'NS' ? [0, 2] : [1, 3];
  const names = seats
    .map((s) => members.find((m) => m.seat === s)?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  if (names.length === 1) return names[0];
  return team === 'NS' ? 'North/South' : 'East/West';
}

/** Count tricks won by each seat in the current hand. */
export function tricksBySeat(
  completedTricks: { winner?: number }[]
): Record<SeatIndex, number> {
  const out: Record<SeatIndex, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const t of completedTricks) {
    if (t.winner !== undefined) out[t.winner as SeatIndex]++;
  }
  return out;
}

export { TEAM_OF };
