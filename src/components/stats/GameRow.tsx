'use client';
// One recorded game — teams, score, date, hands, duration, source badge.
// Shared by the dashboard's "Recent games" list and the /stats/games archive.

import type { MatchRecord } from '@/lib/shared-types';
import { gameDurationMs, formatDuration } from '@/lib/stats-sessions';
import PlayerLink from './PlayerLink';

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function GameRow({
  match: m,
  onDelete,
}: {
  match: MatchRecord;
  /** When provided, shows the admin ✕ delete control. */
  onDelete?: (id: string) => void;
}) {
  const ns = m.players.filter((p) => p.team === 'NS').map((p) => p.name);
  const ew = m.players.filter((p) => p.team === 'EW').map((p) => p.name);
  const nsWon = m.winnerTeam === 'NS';
  const duration = gameDurationMs(m);
  return (
    <div className="group bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={nsWon ? 'text-gold font-medium' : 'text-white/70'}>
            {ns.map((n, i) => (
              <span key={n}>
                {i > 0 && <span className="text-white/40"> &amp; </span>}
                <PlayerLink name={n} />
              </span>
            ))}{' '}
            {nsWon && '👑'}
          </span>
          <span className="text-white/40">vs</span>
          <span className={!nsWon ? 'text-gold font-medium' : 'text-white/70'}>
            {ew.map((n, i) => (
              <span key={n}>
                {i > 0 && <span className="text-white/40"> &amp; </span>}
                <PlayerLink name={n} />
              </span>
            ))}{' '}
            {!nsWon && '👑'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-white/60 text-xs whitespace-nowrap">
            {m.finalScore.NS}–{m.finalScore.EW}
          </span>
          {onDelete && (
            <button
              onClick={() => onDelete(m.id)}
              aria-label="Delete this game"
              title="Delete this game"
              className="text-white/30 hover:text-red-300 px-1 sm:opacity-0 sm:group-hover:opacity-100 transition"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="text-[11px] text-white/40 mt-0.5 flex items-center gap-1.5 flex-wrap">
        <span>
          {formatDate(m.ts)} · {m.handsPlayed} hands
          {duration != null && ` · ${formatDuration(duration)}`}
        </span>
        {m.source === 'manual' && (
          <span className="text-[10px] uppercase tracking-wider bg-white/10 border border-white/15 rounded px-1 py-0.5">
            ✏️ in person
          </span>
        )}
        {m.source === 'historical' && (
          <span className="text-[10px] uppercase tracking-wider bg-white/10 border border-white/15 rounded px-1 py-0.5">
            📜 historical
          </span>
        )}
      </div>
    </div>
  );
}
