'use client';
import { CardBack } from './Card';
import type { RoomMember } from '@/lib/shared-types';

export default function PlayerSeat({
  position,
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
  position: 'top' | 'left' | 'right';
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
  const layoutClass =
    position === 'top'
      ? 'flex-col-reverse'
      : position === 'left'
        ? 'flex-row-reverse'
        : 'flex-row';

  return (
    <div className={`flex items-center gap-2 ${layoutClass}`}>
      <div
        className={`px-3 py-1.5 rounded-lg bg-black/45 border border-white/10 flex items-center gap-2 ${
          isTurn ? 'turn-ring' : ''
        } ${winFlash ? 'seat-win-flash' : ''}`}
      >
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            title={member?.connected ? 'Connected' : 'Disconnected'}
            className={`inline-block w-2 h-2 rounded-full ${
              member?.connected ? 'bg-gold' : 'bg-red-400'
            }`}
          />
          <span className="sr-only">
            {member?.connected ? 'connected' : 'disconnected'}
          </span>
          <span className="text-sm font-medium text-white/90">
            {member?.name ?? 'Empty'}
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
      <div className="flex" style={{ minWidth: 60, minHeight: 60 }}>
        {handCount > 0 ? (
          <div className={`relative ${sittingOut ? 'opacity-30 grayscale' : ''}`}>
            <CardBack size="sm" count={handCount} />
          </div>
        ) : (
          <div className="text-white/30 text-xs italic">no cards</div>
        )}
      </div>
    </div>
  );
}
