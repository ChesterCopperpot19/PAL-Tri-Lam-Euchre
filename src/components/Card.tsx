'use client';
import { useState } from 'react';
import type { Card as CardT, Rank, Suit } from '@/server/engine/types';

const NUM_BACKS = 5;

const SUIT_GLYPH: Record<Suit, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
const SUIT_COLOR: Record<Suit, string> = {
  H: '#c0202c',
  D: '#c0202c',
  C: '#1a1a1a',
  S: '#1a1a1a',
};
const SUIT_NAME: Record<Suit, string> = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades',
};
const RANK_NAME: Record<Rank, string> = {
  '9': 'Nine',
  '10': 'Ten',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
};

/** Accessible name for a card, e.g. "King of Spades". */
export function cardLabel(card: CardT): string {
  return `${RANK_NAME[card.rank]} of ${SUIT_NAME[card.suit]}`;
}

/** Size classes live in globals.css; "md" is fluid (scales with the viewport),
 *  sm/lg are fixed. font-size on the card drives the em-based rank/suit. */
const sizeClass = (size: 'sm' | 'md' | 'lg') =>
  size === 'sm' ? 'card-sz-sm' : size === 'lg' ? 'card-sz-lg' : 'card-sz-md';

export function CardFace({
  card,
  highlight = false,
  dim = false,
  onClick,
  size = 'md',
}: {
  card: CardT;
  highlight?: boolean;
  dim?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const color = SUIT_COLOR[card.suit];
  const glyph = SUIT_GLYPH[card.suit];

  // Rank in the corners; a large suit symbol fills the center so the suit is
  // unmistakable at a glance (face cards no longer show a big letter). Inner
  // sizes are in em, so they scale with the card's (fluid) font-size.
  const corner = (
    <span className="leading-none flex flex-col items-center font-bold" style={{ fontSize: '1em' }}>
      <span>{card.rank}</span>
      <span className="leading-none">{glyph}</span>
    </span>
  );
  const inner = (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute top-[5%] left-[8%]">{corner}</div>
      <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: '3.1em' }}>
        <span>{glyph}</span>
      </div>
      <div className="absolute bottom-[5%] right-[8%] rotate-180">{corner}</div>
    </div>
  );

  // Non-interactive cards (opponents' plays, your hand off-turn) are plain
  // images, not disabled buttons — less noise for keyboard & screen readers.
  if (!onClick) {
    return (
      <div
        role="img"
        aria-label={cardLabel(card)}
        className={`card-face card-base ${sizeClass(size)} relative ${dim ? 'illegal-dim' : ''}`}
        style={{ color }}
      >
        {inner}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-label={cardLabel(card)}
      className={`card-face card-base ${sizeClass(size)} relative transition-transform duration-150 cursor-pointer ${
        highlight ? 'legal-glow' : ''
      } ${dim ? 'illegal-dim' : ''} hover:-translate-y-1`}
      style={{ color }}
    >
      {inner}
    </button>
  );
}

export function CardBack({
  size = 'md',
  count = 1,
}: {
  size?: 'sm' | 'md' | 'lg';
  count?: number;
}) {
  // Pick a stable random photo per-mount. Stable means no flicker on re-renders;
  // tied to component instance (slot), not to a specific card, so it leaks no info.
  const [photoIdx] = useState(() => Math.floor(Math.random() * NUM_BACKS) + 1);

  return (
    <div
      className="relative"
      role="img"
      aria-label={count > 1 ? `${count} face-down cards` : 'Face-down card'}
    >
      <div
        className={`card-back card-base ${sizeClass(size)}`}
        style={{
          backgroundImage: `url(/card-backs/${photoIdx}.jpg)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      {count > 1 && (
        <div
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 bg-black/70 text-white text-xs rounded-full px-1.5 py-0.5"
        >
          {count}
        </div>
      )}
    </div>
  );
}

export function SuitGlyph({
  suit,
  size = 24,
  color,
}: {
  suit: Suit;
  size?: number;
  /** Override the default red/black suit color (e.g. force gold for the trump pill). */
  color?: string;
}) {
  return (
    <span
      role="img"
      aria-label={SUIT_NAME[suit]}
      style={{ color: color ?? SUIT_COLOR[suit], fontSize: size, lineHeight: 1 }}
    >
      {SUIT_GLYPH[suit]}
    </span>
  );
}
