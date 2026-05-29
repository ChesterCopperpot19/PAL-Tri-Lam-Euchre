'use client';
import { CardFace } from './Card';
import type { Card as CardT } from '@/server/engine/types';

export default function DiscardPanel({
  hand,
  upcardId,
  onDiscard,
}: {
  hand: CardT[];
  /** Id of the card that was just picked up (the former upcard). */
  upcardId: string | null;
  onDiscard: (cardId: string) => void;
}) {
  return (
    <div className="bg-black/55 border border-gold/40 rounded-xl p-3 sm:p-4 shadow-xl">
      <div className="text-sm text-white/80 mb-2">
        You picked up the upcard — discard one card. The{' '}
        <span className="text-gold font-medium">picked-up card</span> is marked below.
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {hand.map((c) => {
          const isPickedUp = c.id === upcardId;
          return (
            <div key={c.id} className="relative">
              <CardFace card={c} highlight onClick={() => onDiscard(c.id)} />
              {isPickedUp && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gold text-black text-[9px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 whitespace-nowrap shadow">
                  Picked up
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
