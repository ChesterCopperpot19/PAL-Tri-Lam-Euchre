'use client';
import { CardBack } from './Card';
import type { RoomMember } from '@/lib/shared-types';

/** An opponent's or partner's seat: card stack above a name plate. Sized to fit a
 *  narrow grid cell, so long names truncate (full name in the label and tooltip)
 *  and badges wrap onto a second line instead of widening the plate. */
export default function PlayerSeat({
  member,
  handCount,
  isDealer,
  isTurn,
  isMaker,
  sittingOut,
  trickCount,
  showTricks,
  winFlash = false,
}: {
  member?: RoomMember;
  handCount: number;
  isDealer: boolean;
  isTurn: boolean;
  isMaker: boolean;
  sittingOut: boolean;
  /** Tricks won by this seat in the current hand. */
  trickCount: number;
  /** Whether to render the trick badge (only true mid-hand). */
  showTricks: boolean;
  /** Brief gold pulse when this seat just won a trick. */
  winFlash?: boolean;
}) {
  const name = member?.name ?? 'Empty';

  return (
    <div
      role="group"
      aria-label={name}
      className="flex flex-col-reverse items-center gap-2 max-w-full min-w-0"
    >
      <div
        className={`max-w-full px-2 sm:px-3 py-1.5 rounded-lg bg-black/45 border border-white/10 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 ${
          isTurn ? 'turn-ring' : ''
        } ${winFlash ? 'seat-win-flash' : ''}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 max-w-full">
          <span
            aria-hidden="true"
            title={member?.connected ? 'Connected' : 'Disconnected'}
            className={`inline-block shrink-0 w-2 h-2 rounded-full ${
              member?.connected ? 'bg-gold' : 'bg-slate-400'
            }`}
          />
          <span className="sr-only">
            {member?.connected ? 'connected' : 'disconnected'}
          </span>
          <span className="truncate text-sm font-medium text-white/90" title={name}>
            {name}
          </span>
        </div>
        {isDealer && (
          <span className="text-[10px] uppercase tracking-wider bg-gold text-black rounded px-1.5 py-0.5">
            Dealer
          </span>
        )}
        {isMaker && (
          <span className="text-[10px] uppercase tracking-wider bg-gold text-black rounded px-1.5 py-0.5">
            Maker
          </span>
        )}
        {sittingOut && (
          <span className="text-[10px] uppercase tracking-wider bg-violet-500 text-white rounded px-1.5 py-0.5 font-semibold">
            Sitting Out
          </span>
        )}
        {showTricks && (
          <span
            className="text-[10px] uppercase tracking-wider bg-white/10 border border-white/15 text-white/85 rounded px-1.5 py-0.5"
            title="Tricks won this hand"
          >
            🏆 {trickCount}
          </span>
        )}
      </div>
      <div className="flex justify-center" style={{ minHeight: 60 }}>
        {handCount > 0 ? (
          <div className={`relative ${sittingOut ? 'opacity-30 grayscale' : ''}`}>
            <CardBack size="sm" count={handCount} />
          </div>
        ) : (
          <div className="text-white/60 text-xs italic">no cards</div>
        )}
      </div>
    </div>
  );
}
