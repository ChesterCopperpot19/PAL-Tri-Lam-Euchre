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

/** Per-player stats within a single completed match. */
export type PlayerMatchStat = {
  name: string;
  seat: 0 | 1 | 2 | 3;
  team: 'NS' | 'EW';
  isBot: boolean;
  tricks: number;
  defensiveTricks: number;
  handsCalled: number;
  callsWon: number;
  euchres: number;
  marches: number;
  loneCalled: number;
  loneWon: number;
};

/** One completed game (to 10), recorded for all-time stats. */
export type MatchRecord = {
  id: string;
  ts: number; // epoch ms
  winnerTeam: 'NS' | 'EW';
  finalScore: { NS: number; EW: number };
  handsPlayed: number;
  players: PlayerMatchStat[];
};

/** Aggregated all-time stats for a single (human) player, keyed by name. */
export type PlayerAllTime = {
  name: string;
  games: number;
  wins: number;
  tricks: number;
  defensiveTricks: number;
  handsCalled: number;
  callsWon: number;
  euchres: number;
  marches: number;
  loneCalled: number;
  loneWon: number;
};

export type StatsPayload = {
  /** Most-recent matches first (capped). */
  matches: MatchRecord[];
  /** Human players, aggregated all-time, sorted by wins. */
  players: PlayerAllTime[];
  /** Total matches recorded overall. */
  totalMatches: number;
};

/** Public summary of a room shown on the landing page. */
export type RoomListEntry = {
  code: string;
  /** 'LOBBY' | 'BIDDING_1' | 'BIDDING_2' | 'DEALER_DISCARD' | 'PLAYING' | 'HAND_END' | 'GAME_OVER' */
  phase: string;
  /** Public member list — names + seat + bot flag. No hands or other private info. */
  members: Array<{
    name: string;
    seat: 0 | 1 | 2 | 3 | null;
    isBot: boolean;
  }>;
  /** Count of currently seated players (humans + bots). */
  seatedCount: number;
  /** True if all 4 seats are filled. */
  full: boolean;
  spectatorCount: number;
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
  'room:moveSeat': (payload: { seat: 0 | 1 | 2 | 3 }) => void;
  'room:addBot': (payload: { seat?: 0 | 1 | 2 | 3 }) => void;
  'room:removeBot': (payload: { seat: 0 | 1 | 2 | 3 }) => void;
  'room:fillBots': () => void;
  'rooms:list': (
    ack: (rooms: RoomListEntry[]) => void
  ) => void;
  'stats:get': (ack: (payload: StatsPayload) => void) => void;
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
