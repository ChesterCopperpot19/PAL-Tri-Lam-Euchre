'use client';
import { CardFace } from './Card';
import type { Card as CardT } from '@/server/engine/types';

export default function Hand({
  cards,
  legalIds,
  onPlay,
  size = 'md',
}: {
  cards: CardT[];
  legalIds: string[]; // empty = nothing selectable
  onPlay?: (cardId: string) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const interactive = onPlay && legalIds.length > 0;
  return (
    <div className="flex justify-center items-end gap-2 sm:gap-3 flex-wrap">
      {cards.map((c) => {
        const isLegal = legalIds.includes(c.id);
        return (
          <CardFace
            key={c.id}
            card={c}
            size={size}
            highlight={interactive && isLegal}
            dim={interactive && !isLegal}
            onClick={interactive && isLegal ? () => onPlay!(c.id) : undefined}
          />
        );
      })}
    </div>
  );
}
