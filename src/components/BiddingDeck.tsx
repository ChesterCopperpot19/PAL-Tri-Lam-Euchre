'use client';
import { CardBack, CardFace, cardLabel } from './Card';
import type { Card as CardT } from '@/server/engine/types';

/**
 * Stacked-deck visual shown during bidding.
 *  - Round 1 (BIDDING_1): 3 face-down cards + the upcard face-up on top.
 *  - Round 2 (BIDDING_2): 4 face-down cards (the upcard has been "turned down").
 *
 * Replaces the lone-card-in-the-middle look during bidding so players see
 * what they're bidding against.
 */
export default function BiddingDeck({
  upcard,
  showUpcard,
}: {
  upcard: CardT | null;
  showUpcard: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative"
        role="img"
        aria-label={
          showUpcard && upcard ? `Upcard: ${cardLabel(upcard)}` : 'Kitty (turned down)'
        }
        style={{ width: 90, height: 120 }}
      >
        {/* Bottom of stack — three back-cards offset to suggest depth. */}
        <div
          className="absolute"
          style={{ top: 6, left: -6, transform: 'rotate(-3deg)' }}
        >
          <CardBack />
        </div>
        <div
          className="absolute"
          style={{ top: 3, left: -2, transform: 'rotate(1deg)' }}
        >
          <CardBack />
        </div>
        <div className="absolute" style={{ top: 0, left: 2 }}>
          <CardBack />
        </div>
        {/* Top card — face-up upcard (round 1) or face-down (round 2). */}
        <div
          className="absolute"
          style={{ top: -4, left: 6, transform: 'rotate(2deg)' }}
        >
          {showUpcard && upcard ? <CardFace card={upcard} /> : <CardBack />}
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">
        {showUpcard ? 'Upcard' : 'Turned down'}
      </div>
    </div>
  );
}
