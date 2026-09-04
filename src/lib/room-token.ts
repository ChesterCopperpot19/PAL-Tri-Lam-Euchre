'use client';

// Per-room seat reclaim token. The server hands one out on every successful
// room:join and requires it to re-attach to a registration for our playerId
// (the playerId itself is visible to the whole room, so it can't be the proof).
// Shared by the landing page (which creates/joins the room) and the room page
// (which re-joins on mount, reconnect, and refresh).

const key = (code: string) => 'euchre.token.' + code.toUpperCase();

export function readRoomToken(code: string): string | undefined {
  try {
    return localStorage.getItem(key(code)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeRoomToken(code: string, token: string): void {
  try {
    localStorage.setItem(key(code), token);
  } catch {
    /* storage unavailable (private mode) — a refresh will just need a new seat */
  }
}
