// Authorization for destructive stats operations (currently: deleting a game).
// A single shared admin key, configured server-side via the STATS_ADMIN_KEY
// environment variable. Pure + server-only (reads process.env) — unit-testable.

import { timingSafeEqual } from 'node:crypto';

/** True only if `key` matches the configured STATS_ADMIN_KEY, compared in
 *  constant time. Fails closed: if the env var is unset, nobody is authorized —
 *  the operation stays locked rather than silently open. */
export function isStatsAdmin(key: unknown): boolean {
  const secret = process.env.STATS_ADMIN_KEY;
  if (!secret) return false; // not configured → locked
  if (typeof key !== 'string' || key.length === 0) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on unequal-length buffers; unequal length ⇒ no match.
  return a.length === b.length && timingSafeEqual(a, b);
}
