'use client';
import { CardFace } from './Card';
import BiddingDeck from './BiddingDeck';
import type { Card as CardT, Phase, SeatIndex, Suit } from '@/server/engine/types';

/** Position for each seat relative to viewer (south=0). */
function relPos(viewer: SeatIndex | null, seat: SeatIndex): 'bottom' | 'left' | 'top' | 'right' {
  const v = viewer ?? 0;
  const diff = ((seat - v + 4) % 4) as 0 | 1 | 2 | 3;
  return (['bottom', 'left', 'top', 'right'] as const)[diff];
}

export type PendingTrick = {
  plays: { seat: SeatIndex; card: CardT }[];
  winnerSeat: SeatIndex;
  /** When true, apply the fly-to-winner animation. */
  animFly: boolean;
};

export default function TrickArea({
  plays,
  upcard,
  trump,
  viewerSeat,
  phase,
  pendingTrick,
}: {
  plays: { seat: SeatIndex; card: CardT }[];
  upcard: CardT | null;
  trump: Suit | null;
  viewerSeat: SeatIndex | null;
  phase: Phase;
  /** When the previous trick is being shown / animated to its winner. */
  pendingTrick?: PendingTrick | null;
}) {
  // While the previous trick is being shown/animated, render those 4 cards
  // instead of the (now-empty) currentTrick.
  const renderPlays = pendingTrick?.plays ?? plays;
  const slot: Record<'bottom' | 'left' | 'top' | 'right', CardT | null> = {
    bottom: null,
    left: null,
    top: null,
    right: null,
  };
  for (const p of renderPlays) slot[relPos(viewerSeat, p.seat)] = p.card;

  const winnerDir = pendingTrick ? relPos(viewerSeat, pendingTrick.winnerSeat) : null;
  const flyClass =
    pendingTrick?.animFly && winnerDir ? `trick-fly-${winnerDir}` : '';

  const showDeck =
    !pendingTrick &&
    plays.length === 0 &&
    (phase === 'BIDDING_1' || phase === 'BIDDING_2');

  return (
    <div className="relative w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center">
      {/* Bidding deck: shows the kitty with the upcard face-up in round 1, or
          face-down in round 2 (the upcard has been "turned down" per Euchre rules). */}
      {showDeck && (
        <BiddingDeck
          upcard={upcard}
          showUpcard={phase === 'BIDDING_1' && !!upcard}
        />
      )}

      {/* Played cards positioned directly in front of each seat — top/left/right/bottom
          relative to the viewer. With the bigger trick area the four slots no longer
          overlap, so it's visually unambiguous which card came from which player.
          A subtle rotation reinforces "this card came from over there". */}
      <div className="absolute inset-0">
        {slot.top && (
          <div
            className={`absolute left-1/2 top-2 -translate-x-1/2 -rotate-3 fade-in ${flyClass}`}
          >
            <CardFace card={slot.top} />
          </div>
        )}
        {slot.bottom && (
          <div
            className={`absolute left-1/2 bottom-2 -translate-x-1/2 rotate-3 fade-in ${flyClass}`}
          >
            <CardFace card={slot.bottom} />
          </div>
        )}
        {slot.left && (
          <div
            className={`absolute left-2 top-1/2 -translate-y-1/2 -rotate-3 fade-in ${flyClass}`}
          >
            <CardFace card={slot.left} />
          </div>
        )}
        {slot.right && (
          <div
            className={`absolute right-2 top-1/2 -translate-y-1/2 rotate-3 fade-in ${flyClass}`}
          >
            <CardFace card={slot.right} />
          </div>
        )}
      </div>
    </div>
  );
}
