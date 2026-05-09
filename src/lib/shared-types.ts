// Types shared between client and server. The client imports redacted state shape
// from the server's redact.ts, but everything below is what travels over the wire.

import type { RedactedState } from '@/server/engine/redact';

export type Role = 'player' | 'spectator';

export type RoomMember = {
  playerId: string;
  name: string;
  /** seat 0..3 if player, null if spectator */
  seat: 0 | 1 | 2 | 3 | null;
  connected: boolean;
  isBot: boolean;
};

export type RoomSnapshot = {
  code: string;
  members: RoomMember[];
  hostPlayerId: string;
  /** Number of spectators (members with seat=null). */
  spectatorCount: number;
  /** True if all 4 seats are filled. */
  full: boolean;
  state: RedactedState;
};

export type ChatMessage = {
  id: string;
  from: string;
  fromSpectator: boolean;
  text: string;
  ts: number;
};

// ---------- client → server ----------
export type ClientToServerEvents = {
  'room:join': (
    payload: { code: string; name: string; playerId: string; asSpectator?: boolean },
    ack: (res: { ok: true; snapshot: RoomSnapshot } | { ok: false; error: string }) => void
  ) => void;
  'room:leave': () => void;
  'room:start': () => void;
  'room:nextHand': () => void;
  'room:promote': (payload: { playerId: string; seat: 0 | 1 | 2 | 3 }) => void;
  'room:addBot': (payload: { seat?: 0 | 1 | 2 | 3 }) => void;
  'room:removeBot': (payload: { seat: 0 | 1 | 2 | 3 }) => void;
  'room:fillBots': () => void;
  'bid:order': (payload: { alone: boolean }) => void;
  'bid:pass': () => void;
  'bid:call': (payload: { suit: 'H' | 'D' | 'C' | 'S'; alone: boolean }) => void;
  'discard:card': (payload: { cardId: string }) => void;
  'play:card': (payload: { cardId: string }) => void;
  'chat:send': (payload: { text: string }) => void;
};

// ---------- server → client ----------
export type ServerToClientEvents = {
  'room:snapshot': (snap: RoomSnapshot) => void;
  'room:error': (msg: string) => void;
  'chat:msg': (msg: ChatMessage) => void;
  'room:event': (event: string) => void;
};
