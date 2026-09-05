// Client-side handling of the shared stats admin key (STATS_ADMIN_KEY on the
// server). The key gates destructive/write operations — deleting a game and
// logging a manual game. It is held in sessionStorage so it lives only as long
// as the tab; the server re-checks it on every request, so this is purely UX.
//
// Older builds kept the key in localStorage: `getAdminKey` migrates any such
// value into sessionStorage once and removes the persistent copy.

export const ADMIN_KEY_STORAGE = 'euchre_admin_key';

/** The stored admin key, or null when none is saved (or storage is unavailable). */
export function getAdminKey(): string | null {
  try {
    const k = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (k) return k;
  } catch {
    /* sessionStorage unavailable */
  }
  // One-time migration from the old persistent location.
  try {
    const legacy = localStorage.getItem(ADMIN_KEY_STORAGE);
    if (legacy) {
      localStorage.removeItem(ADMIN_KEY_STORAGE);
      setAdminKey(legacy);
      return legacy;
    }
  } catch {
    /* localStorage unavailable */
  }
  return null;
}

/** Persist the key for this tab/session. */
export function setAdminKey(key: string): void {
  try {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
  } catch {
    /* ignore — the key still works for this page load via React state */
  }
}

/** Forget the stored key (both locations, in case a legacy copy lingers). */
export function clearAdminKey(): void {
  try {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

/** Ask for the key with a browser prompt, store it, and return it. Returns null
 *  when the prompt is cancelled or left blank (nothing is stored). */
export function promptAdminKey(message = 'Enter the stats admin key:'): string | null {
  const entered = window.prompt(message);
  if (entered == null) return null; // cancelled
  const k = entered.trim();
  if (!k) return null;
  setAdminKey(k);
  return k;
}
