import { ALL_RANKS, ALL_SUITS, Card } from './types';

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ALL_SUITS) {
    for (const rank of ALL_RANKS) {
      deck.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  return deck;
}

/** Mulberry32 — fast, seedable PRNG. Deterministic shuffles for tests. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unbiased random integer in [0, n) from the platform CSPRNG (Web Crypto,
 *  available in Node and browsers). Rejection sampling avoids modulo bias. */
function secureInt(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

/** Fisher–Yates with a CSPRNG. Live deals use this so no player can recover
 *  the deck from the cards they see (a 32-bit seed can be brute-forced). */
export function secureShuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = secureInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
