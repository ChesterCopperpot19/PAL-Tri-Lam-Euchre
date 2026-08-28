'use client';
import type { Suit } from '@/server/engine/types';
import { SUIT_COLOR_ON_DARK, SUIT_GLYPH } from '@/lib/suits';

const GLYPH_TO_SUIT = Object.fromEntries(
  (Object.entries(SUIT_GLYPH) as [Suit, string][]).map(([suit, glyph]) => [glyph, suit])
) as Record<string, Suit | undefined>;

/**
 * Render a string that may contain suit glyphs ("10♥", "♠", "led ♣"), tinting each
 * glyph with the four-color deck palette so ♠ and ♣ never read alike. Non-glyph
 * characters keep the surrounding text color.
 */
export default function SuitedText({ text, empty = '—' }: { text: string; empty?: string }) {
  if (!text) return <span className="text-white/30">{empty}</span>;
  return (
    <span className="text-white/90">
      {text
        .split(/([♥♦♣♠])/)
        .filter(Boolean)
        .map((part, i) => {
          const suit = GLYPH_TO_SUIT[part];
          return suit ? (
            <span key={i} style={{ color: SUIT_COLOR_ON_DARK[suit] }}>
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          );
        })}
    </span>
  );
}
