'use client';
import { CardFace } from './Card';
import type { Card as CardT } from '@/server/engine/types';

export default function DiscardPanel({
  hand,
  onDiscard,
}: {
  hand: CardT[];
  onDiscard: (cardId: string) => void;
}) {
  return (
    <div className="bg-black/55 border border-gold/40 rounded-xl p-3 sm:p-4 shadow-xl">
      <div className="text-sm text-white/80 mb-2">
        You took up the upcard — discard one card:
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {hand.map((c) => (
          <CardFace key={c.id} card={c} highlight onClick={() => onDiscard(c.id)} />
        ))}
      </div>
    </div>
  );
}
