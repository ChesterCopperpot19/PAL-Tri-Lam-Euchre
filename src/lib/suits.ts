import type { Suit } from '@/server/engine/types';

export const SUIT_GLYPH: Record<Suit, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };

export const SUIT_NAME: Record<Suit, string> = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades',
};

// Four-color deck. Two-color decks make ♠ and ♣ near-impossible to tell apart at a
// glance — especially on the dark felt — so each suit gets its own hue. Every value
// below clears WCAG AA (4.5:1) against the surface it actually renders on.

/** For the cream card face (#fdfcf7). Ratios: ♠ 16.9, ♥ 5.9, ♣ 6.4, ♦ 4.9. */
export const SUIT_COLOR_ON_LIGHT: Record<Suit, string> = {
  S: '#1a1a1a',
  H: '#c0202c',
  C: '#136b34',
  D: '#b8500a',
};

/**
 * For dark navy surfaces — buttons (#141B4D), their hover tint (#22306e), and the
 * black/55 panels over the felt. Worst case is the hover tint: ♠ 12.2, ♥ 4.9, ♣ 7.0, ♦ 6.4.
 */
export const SUIT_COLOR_ON_DARK: Record<Suit, string> = {
  S: '#ffffff',
  H: '#ff7a7e',
  C: '#4ade80',
  D: '#ffa94d',
};
