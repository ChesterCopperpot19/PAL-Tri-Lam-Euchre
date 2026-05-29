'use client';
import type { Suit } from '@/server/engine/types';

const SUIT_GLYPH: Record<Suit, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
const SUIT_NAME: Record<Suit, string> = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades',
};
// Bright, high-contrast colors that read on the dark felt for every suit.
const SUIT_COLOR: Record<Suit, string> = {
  H: '#ff5a5f',
  D: '#ff5a5f',
  C: '#ffffff',
  S: '#ffffff',
};

/**
 * Large, always-on trump indicator. Sits in the corner of the table the whole
 * hand so the trump suit is unmistakable at a glance.
 */
export default function TrumpBadge({ trump }: { trump: Suit | null }) {
  if (!trump) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 bg-black/55 border-2 border-gold/70 rounded-2xl px-3 py-2 shadow-xl backdrop-blur-sm">
      <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-gold/90">
        Trump
      </div>
      <div
        className="leading-none"
        style={{ color: SUIT_COLOR[trump], fontSize: 'clamp(40px, 9vw, 64px)' }}
        aria-label={`Trump is ${SUIT_NAME[trump]}`}
      >
        {SUIT_GLYPH[trump]}
      </div>
      <div className="text-[10px] sm:text-xs font-medium text-white/85">
        {SUIT_NAME[trump]}
      </div>
    </div>
  );
}
