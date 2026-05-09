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
}) {
  const layoutClass =
    position === 'top'
      ? 'flex-col-reverse'
      : position === 'left'
        ? 'flex-row-reverse'
        : 'flex-row';
  const fanOrient =
    position === 'top'
      ? 'flex-row'
      : position === 'left'
        ? 'flex-col'
        : 'flex-col';
  const cardSize = position === 'top' ? 'sm' : 'sm';

  return (
    <div className={`flex items-center gap-2 ${layoutClass}`}>
      <div
        className={`px-3 py-1.5 rounded-lg bg-black/45 border border-white/10 flex items-center gap-2 ${
          isTurn ? 'turn-ring' : ''
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              member?.connected ? 'bg-gold' : 'bg-red-400'
            }`}
          />
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
          <span className="text-[10px] uppercase tracking-wider bg-white/30 text-black rounded px-1.5 py-0.5">
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
      <div className={`flex ${fanOrient} gap-[-30px]`} style={{ minWidth: 60, minHeight: 60 }}>
        {handCount > 0 ? (
          <div className="relative">
            <CardBack size={cardSize} count={handCount} />
          </div>
        ) : (
          <div className="text-white/30 text-xs italic">no cards</div>
        )}
      </div>
    </div>
  );
}
