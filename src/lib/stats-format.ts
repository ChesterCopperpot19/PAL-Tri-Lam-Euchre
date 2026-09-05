// Tiny display formatters shared across the stats pages/components. Pure.

/** Fraction (0..1) → whole-number percent string, e.g. 0.6667 → "67%". */
export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** One-decimal fixed string, e.g. 7.25 → "7.3". */
export const one = (n: number) => n.toFixed(1);
