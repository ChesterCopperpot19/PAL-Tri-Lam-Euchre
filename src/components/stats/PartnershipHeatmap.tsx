'use client';
// Partnership win-rate matrix. cell[row][col] = win % when those two players were
// partners. Built as a CSS grid (not Chart.js) so it stays crisp and responsive,
// and scrolls horizontally on a phone. Color runs red → amber → green by win %.

import { duoLookup, type DuoRow, type PlayerRow } from '@/lib/stats-analytics';

/** red (0%) → amber (50%) → green (100%) via hue, dark enough for white text. */
function winColor(pct: number): string {
  const hue = Math.round(pct * 120); // 0 = red, 120 = green
  return `hsl(${hue}, 58%, 30%)`;
}

function pairKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

export default function PartnershipHeatmap({
  players,
  duos,
}: {
  players: PlayerRow[];
  duos: DuoRow[];
}) {
  // Most-active players first; cap so the grid stays readable on a phone.
  const names = players
    .slice()
    .sort((a, b) => b.games - a.games)
    .slice(0, 10)
    .map((p) => p.name);

  const lookup = duoLookup(duos);

  if (names.length < 2) {
    return <p className="text-white/50 text-sm">Not enough players yet for a partnership matrix.</p>;
  }

  const cell = 'min-w-[44px] w-11 h-11 sm:min-w-[52px] sm:w-13 sm:h-13';

  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-black/40" />
            {names.map((n) => (
              <th
                key={n}
                className={`${cell} text-[10px] text-white/70 font-medium align-bottom`}
                title={n}
              >
                <span className="block truncate px-0.5">{n}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {names.map((rowName) => (
            <tr key={rowName}>
              <th
                className="sticky left-0 z-10 bg-black/40 text-right pr-2 text-[11px] text-white/70 font-medium whitespace-nowrap max-w-[90px] truncate"
                title={rowName}
              >
                {rowName}
              </th>
              {names.map((colName) => {
                if (rowName === colName) {
                  return (
                    <td key={colName} className={`${cell} rounded bg-white/5`} aria-hidden />
                  );
                }
                const duo = lookup.get(pairKey(rowName, colName));
                if (!duo) {
                  return (
                    <td
                      key={colName}
                      className={`${cell} rounded bg-black/30 text-white/20 text-center text-xs`}
                      title={`${rowName} & ${colName}: never partnered`}
                    >
                      ·
                    </td>
                  );
                }
                return (
                  <td
                    key={colName}
                    className={`${cell} rounded text-center text-white font-semibold text-xs leading-none`}
                    style={{ background: winColor(duo.winPct) }}
                    title={`${rowName} & ${colName}: ${duo.wins}–${duo.losses} (${Math.round(
                      duo.winPct * 100
                    )}%, ${duo.games} games)`}
                  >
                    {Math.round(duo.winPct * 100)}
                    <span className="text-[8px] font-normal opacity-80">%</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 mt-2 text-[11px] text-white/50">
        <span>Lower win %</span>
        <span className="inline-block h-2 w-24 rounded" style={{ background: 'linear-gradient(90deg, hsl(0,58%,30%), hsl(60,58%,30%), hsl(120,58%,30%))' }} />
        <span>Higher</span>
      </div>
    </div>
  );
}
