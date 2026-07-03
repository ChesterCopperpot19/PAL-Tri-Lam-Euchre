'use client';
// "Last session" recap — the headline panel for a recurring game night: who
// showed up, who took the night, the biggest win, hands and table time.

import Link from 'next/link';
import type { Session } from '@/lib/stats-sessions';
import { formatDuration } from '@/lib/stats-sessions';
import PlayerLink from './PlayerLink';

export function sessionDateLabel(s: Session): string {
  try {
    const d = new Date(s.startTs);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function SessionRecap({ session }: { session: Session }) {
  const s = session;
  const champs = s.champions;
  const champRec = s.records[0];
  const bw = s.biggestWin;
  return (
    <section className="bg-black/40 border border-gold/25 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-gold font-semibold">Last session</h2>
          <p className="text-[11px] text-white/45 mt-0.5">
            {sessionDateLabel(s)} · {s.games.length} game{s.games.length === 1 ? '' : 's'} ·{' '}
            {s.handsTotal} hands
            {s.durationMs != null && ` · ${formatDuration(s.durationMs)} at the table`}
          </p>
        </div>
        <Link
          href="/stats/games"
          className="text-xs bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-2.5 py-1.5 whitespace-nowrap"
        >
          All sessions →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-black/30 border border-white/10 rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider text-white/50">
            🏆 Night belonged to
          </div>
          <div className="font-display text-xl text-white mt-0.5 truncate">
            {champs.map((n, i) => (
              <span key={n}>
                {i > 0 && <span className="text-white/40"> & </span>}
                <PlayerLink name={n} />
              </span>
            ))}
          </div>
          {champRec && (
            <div className="text-xs text-white/60">
              {champRec.wins}–{champRec.losses} on the night
            </div>
          )}
        </div>

        <div className="bg-black/30 border border-white/10 rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider text-white/50">💥 Biggest win</div>
          {bw ? (
            <>
              <div className="font-display text-xl text-white mt-0.5">
                {bw.match.finalScore.NS}–{bw.match.finalScore.EW}
              </div>
              <div className="text-xs text-white/60 truncate">
                {bw.match.players
                  .filter((p) => p.team === bw.match.winnerTeam)
                  .map((p) => p.name)
                  .join(' & ')}{' '}
                by {bw.margin}
              </div>
            </>
          ) : (
            <div className="text-white/40 text-sm mt-1">—</div>
          )}
        </div>

        <div className="bg-black/30 border border-white/10 rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider text-white/50">Records</div>
          <div className="text-sm mt-1 space-y-0.5">
            {s.records.map((r) => (
              <div key={r.name} className="flex justify-between gap-2">
                <span className="truncate">
                  <PlayerLink name={r.name} />
                </span>
                <span className="tabular-nums text-white/70 shrink-0">
                  {r.wins}–{r.losses}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
