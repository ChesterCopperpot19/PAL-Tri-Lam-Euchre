'use client';
// A compact, text-only playing card for the analyzer: rank over suit on card
// stock, four-color suits. Small enough to fit a whole hand on a phone row.

import type { Card } from '@/server/engine/types';
import { SUIT_COLOR_ON_DARK, SUIT_COLOR_ON_LIGHT, SUIT_GLYPH } from '@/lib/suits';
import { cardLabel } from '@/components/Card';

export default function MiniCard({
  card,
  ghost = false,
  ring,
  size = 'md',
}: {
  card: Card;
  /** Already played: kept as a faint placeholder so the hand doesn't jump. */
  ghost?: boolean;
  /** Optional emphasis ring color (e.g. the trick winner). */
  ring?: string;
  size?: 'sm' | 'md';
}) {
  const dims = size === 'sm' ? 'w-7 h-10 text-[11px]' : 'w-9 h-[3.25rem] text-sm';
  return (
    <span
      role="img"
      aria-label={ghost ? `${cardLabel(card)} (played)` : cardLabel(card)}
      className={`inline-flex flex-col items-center justify-center rounded-md font-semibold leading-none shrink-0 select-none ${dims} ${
        ghost ? 'bg-white/5 border border-white/10' : 'bg-card-face shadow-card'
      }`}
      style={{
        color: ghost ? SUIT_COLOR_ON_DARK[card.suit] : SUIT_COLOR_ON_LIGHT[card.suit],
        opacity: ghost ? 0.35 : 1,
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      <span>{card.rank}</span>
      <span className="mt-0.5">{SUIT_GLYPH[card.suit]}</span>
    </span>
  );
}

/** Inline "J♥" text for sentences, in the on-dark suit color. */
export function CardText({ card }: { card: Card }) {
  return (
    <span role="img" aria-label={cardLabel(card)} className="font-semibold whitespace-nowrap" style={{ color: SUIT_COLOR_ON_DARK[card.suit] }}>
      {card.rank}
      {SUIT_GLYPH[card.suit]}
    </span>
  );
}
