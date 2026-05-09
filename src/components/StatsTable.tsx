'use client';
import type { HandSummary, SeatIndex } from '@/server/engine/types';
import { TEAM_OF } from '@/server/engine/types';
import type { RoomMember } from '@/lib/shared-types';

const SEAT_NAME = ['South', 'West', 'North', 'East'] as const;

type Stats = {
  seat: SeatIndex;
  name: string;
  team: 'NS' | 'EW';
  tricks: number;
  defensiveTricks: number;
  handsCalled: number;
  callsWon: number;
  euchres: number;
  marches: number;
  loneCalled: number;
  loneWon: number;
};

function computeStats(history: HandSummary[], members: RoomMember[]): Stats[] {
  // Only seats that actually have a member in them — skip empty seats
  // so the summary reflects the players who were in this match.
  const seatsWithMembers: SeatIndex[] = ([0, 1, 2, 3] as SeatIndex[]).filter((s) =>
    members.some((m) => m.seat === s)
  );
  return seatsWithMembers.map((seat) => {
    const m = members.find((mm) => mm.seat === seat);
    const team = TEAM_OF[seat];
    let tricks = 0;
    let defensiveTricks = 0;
    let handsCalled = 0;
    let callsWon = 0;
    let euchres = 0;
    let marches = 0;
    let loneCalled = 0;
    let loneWon = 0;
    for (const h of history) {
      const trickHere = h.tricksBySeat[seat] ?? 0;
      tricks += trickHere;
      if (h.maker === seat) {
        handsCalled++;
        if (!h.euchred) callsWon++;
        else euchres++;
        if (h.march && !h.euchred) marches++;
        if (h.alone) {
          loneCalled++;
          if (!h.euchred) loneWon++;
        }
      } else {
        defensiveTricks += trickHere;
      }
    }
    return {
      seat,
      name: m?.name ?? SEAT_NAME[seat],
      team,
      tricks,
      defensiveTricks,
      handsCalled,
      callsWon,
      euchres,
      marches,
      loneCalled,
      loneWon,
    };
  });
}

function pct(n: number, d: number): string {
  if (d === 0) return '—';
  return Math.round((n / d) * 100) + '%';
}

export default function StatsTable({
  history,
  members,
}: {
  history: HandSummary[] | undefined;
  members: RoomMember[];
}) {
  const safeHistory = history ?? [];
  if (safeHistory.length === 0) return null;
  const stats = computeStats(safeHistory, members);
  const totalHands = safeHistory.length;

  // Team aggregates — only include if at least one member of that team played.
  const aggregate = (team: 'NS' | 'EW'): Stats | null => {
    const rows = stats.filter((s) => s.team === team);
    if (rows.length === 0) return null;
    return {
      seat: rows[0].seat,
      name: team === 'NS' ? 'N/S Total' : 'E/W Total',
      team,
      tricks: rows.reduce((a, r) => a + r.tricks, 0),
      defensiveTricks: rows.reduce((a, r) => a + r.defensiveTricks, 0),
      handsCalled: rows.reduce((a, r) => a + r.handsCalled, 0),
      callsWon: rows.reduce((a, r) => a + r.callsWon, 0),
      euchres: rows.reduce((a, r) => a + r.euchres, 0),
      marches: rows.reduce((a, r) => a + r.marches, 0),
      loneCalled: rows.reduce((a, r) => a + r.loneCalled, 0),
      loneWon: rows.reduce((a, r) => a + r.loneWon, 0),
    };
  };

  const nsTotal = aggregate('NS');
  const ewTotal = aggregate('EW');

  // Display order: NS pair (those that played), NS total, EW pair, EW total.
  const ns0 = stats.find((s) => s.seat === 0);
  const ns2 = stats.find((s) => s.seat === 2);
  const ew1 = stats.find((s) => s.seat === 1);
  const ew3 = stats.find((s) => s.seat === 3);
  const orderedRows: Stats[] = [
    ns0,
    ns2,
    nsTotal,
    ew1,
    ew3,
    ewTotal,
  ].filter((r): r is Stats => r != null);

  return (
    <div className="bg-black/40 border border-white/10 rounded-lg p-3 text-xs sm:text-sm overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="uppercase tracking-wider text-white/60 text-[10px] sm:text-xs">
          Match summary · {totalHands} {totalHands === 1 ? 'hand' : 'hands'} played
        </div>
      </div>
      <table className="w-full min-w-[640px]">
        <thead className="text-white/60 text-[10px] uppercase tracking-wider">
          <tr>
            <th className="text-left py-1 pr-2">Player</th>
            <th className="text-right py-1 px-1.5" title="Tricks won across the whole game">
              🏆
            </th>
            <th
              className="text-right py-1 px-1.5"
              title="Tricks won when this player was NOT the maker"
            >
              🛡 def
            </th>
            <th
              className="text-right py-1 px-1.5"
              title="Hands this player became maker (called or ordered up)"
            >
              📣 called
            </th>
            <th
              className="text-right py-1 px-1.5"
              title="When they called: hands won — euchres = call success"
            >
              ✓ won
            </th>
            <th
              className="text-right py-1 px-1.5"
              title="Win rate when this player called trump"
            >
              call %
            </th>
            <th
              className="text-right py-1 px-1.5"
              title="Marches (5-trick sweeps) made when calling"
            >
              🌟 march
            </th>
            <th
              className="text-right py-1 px-1.5"
              title="Times this player was euchred when calling"
            >
              ❌ euchred
            </th>
            <th
              className="text-right py-1 px-1.5"
              title="Times this player went alone"
            >
              🔥 lone
            </th>
            <th
              className="text-right py-1 pl-1.5 pr-2"
              title="Loners won (call success while alone)"
            >
              🎯 made
            </th>
          </tr>
        </thead>
        <tbody>
          {orderedRows.map((r, idx) => {
            const isAggregate = r.name.endsWith('Total');
            return (
              <tr
                key={`${r.team}-${r.seat}-${idx}`}
                className={
                  isAggregate
                    ? 'border-t border-white/15 bg-white/5 font-medium'
                    : 'border-t border-white/5'
                }
              >
                <td className="text-left py-1 pr-2 truncate max-w-[120px]">{r.name}</td>
                <td className="text-right py-1 px-1.5">{r.tricks}</td>
                <td className="text-right py-1 px-1.5 text-white/70">{r.defensiveTricks}</td>
                <td className="text-right py-1 px-1.5">{r.handsCalled}</td>
                <td className="text-right py-1 px-1.5">{r.callsWon}</td>
                <td className="text-right py-1 px-1.5 text-gold">
                  {pct(r.callsWon, r.handsCalled)}
                </td>
                <td className="text-right py-1 px-1.5">{r.marches}</td>
                <td className="text-right py-1 px-1.5 text-red-300/90">{r.euchres}</td>
                <td className="text-right py-1 px-1.5">{r.loneCalled}</td>
                <td className="text-right py-1 pl-1.5 pr-2">{r.loneWon}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
