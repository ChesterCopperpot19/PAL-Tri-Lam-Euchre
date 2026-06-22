import { createGame } from './engine/game';
import { GameState, SeatIndex } from './engine/types';
import { ChatMessage, RoomMember } from '@/lib/shared-types';

export type Seat = {
  playerId: string;
  name: string;
  socketId: string | null;
  /** When socketId becomes null we record this. After grace, the seat is freed. */
  disconnectedAt: number | null;
  /** Bot seats have no socket and are driven by the bot engine. */
  isBot: boolean;
};

export type Spectator = {
  playerId: string;
  name: string;
  socketId: string;
};

export type Room = {
  code: string;
  hostPlayerId: string;
  /** Index 0..3 - seat (or null if open). */
  seats: (Seat | null)[];
  spectators: Spectator[];
  state: GameState;
  chatLog: ChatMessage[];
  /** Per-socket recent chat timestamps (rate limit). */
  rateLimit: Map<string, number[]>;
  createdAt: number;
  /** Bot tick timer (null when no bot move pending). */
  botTimer: NodeJS.Timeout | null;
  /** Auto-advance timer used in the HAND_END phase. */
  handEndTimer: NodeJS.Timeout | null;
  /** Auto-play timer for an absent/idle human whose turn it is. */
  turnTimer: NodeJS.Timeout | null;
  /** completedTricks length at the last bot tick (per-room, GC'd with the room). */
  lastTrickCount: number;
  /** Guards against recording the same finished game more than once. */
  statsRecorded: boolean;
  /** When the current game started (epoch ms) — for game-duration stats. */
  startedTs?: number;
};

const DISCONNECT_GRACE_MS = 60_000;

function makeCode(): string {
  // 4 letters, ambiguous chars dropped (no I/O/0/1).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function stripControlChars(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 32 && code !== 127) out += s[i];
  }
  return out;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  create(hostPlayerId: string): Room {
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();
    const room: Room = {
      code,
      hostPlayerId,
      seats: [null, null, null, null],
      spectators: [],
      state: createGame(),
      chatLog: [],
      rateLimit: new Map(),
      createdAt: Date.now(),
      botTimer: null,
      handEndTimer: null,
      turnTimer: null,
      lastTrickCount: 0,
      statsRecorded: false,
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(code: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (room) {
      // Clear any pending timers so they don't keep the room object alive.
      if (room.botTimer) clearTimeout(room.botTimer);
      if (room.handEndTimer) clearTimeout(room.handEndTimer);
      if (room.turnTimer) clearTimeout(room.turnTimer);
    }
    this.rooms.delete(code.toUpperCase());
  }

  list(): Room[] {
    return Array.from(this.rooms.values());
  }

  /** Find seat held by playerId, if any. */
  findSeat(room: Room, playerId: string): SeatIndex | null {
    for (let i = 0; i < 4; i++) {
      if (room.seats[i]?.playerId === playerId) return i as SeatIndex;
    }
    return null;
  }

  /** Find first open seat index (0..3) or null. */
  firstOpenSeat(room: Room): SeatIndex | null {
    for (let i = 0; i < 4; i++) if (!room.seats[i]) return i as SeatIndex;
    return null;
  }

  /** Build per-API member list for snapshots. */
  members(room: Room): RoomMember[] {
    const out: RoomMember[] = [];
    room.seats.forEach((s, i) => {
      if (s)
        out.push({
          playerId: s.playerId,
          name: s.name,
          seat: i as 0 | 1 | 2 | 3,
          connected: s.isBot ? true : !!s.socketId,
          isBot: s.isBot,
        });
    });
    for (const sp of room.spectators) {
      out.push({
        playerId: sp.playerId,
        name: sp.name,
        seat: null,
        connected: true,
        isBot: false,
      });
    }
    return out;
  }

  /** Mark socket disconnected; sets timer to free seat after grace. */
  handleDisconnect(socketId: string, onChange: (room: Room) => void): void {
    for (const room of this.rooms.values()) {
      // Spectators just get removed.
      const before = room.spectators.length;
      room.spectators = room.spectators.filter((sp) => sp.socketId !== socketId);
      if (room.spectators.length !== before) {
        onChange(room);
        continue;
      }
      // Players: keep seat but null socket; schedule grace cleanup.
      for (let i = 0; i < 4; i++) {
        const seat = room.seats[i];
        if (seat && seat.socketId === socketId) {
          seat.socketId = null;
          seat.disconnectedAt = Date.now();
          onChange(room);
          setTimeout(() => {
            const stillSame =
              room.seats[i]?.playerId === seat.playerId &&
              room.seats[i]?.socketId === null &&
              room.seats[i]?.disconnectedAt === seat.disconnectedAt;
            if (!stillSame) return;
            const connectedHumans = room.seats.filter(
              (s) => s && !s.isBot && s.socketId
            ).length;
            const abandoned = connectedHumans === 0 && room.spectators.length === 0;
            if (room.state.phase === 'LOBBY') {
              // In the lobby, free the seat outright after grace.
              room.seats[i] = null;
              if (room.hostPlayerId === seat.playerId) {
                const next =
                  room.seats.find((s) => s && !s.isBot)?.playerId ??
                  room.spectators[0]?.playerId ??
                  '';
                room.hostPlayerId = next;
              }
              onChange(room);
              // Bots alone don't keep a room alive — delete it if nobody's left.
              if (connectedHumans === 0 && room.spectators.length === 0) {
                this.delete(room.code);
              }
            } else if (abandoned) {
              // Mid-game: normally we KEEP the seat held so the player can
              // reconnect (the server auto-plays for them meanwhile). But if the
              // whole room is abandoned — nobody connected, no spectators — there's
              // no one to reconnect for, so tear it down instead of leaking it.
              this.delete(room.code);
            }
          }, DISCONNECT_GRACE_MS);
        }
      }
    }
  }

  /** Add chat message with rate-limit check. Returns null if dropped. */
  postChat(
    room: Room,
    socketId: string,
    name: string,
    fromSpectator: boolean,
    rawText: string
  ): ChatMessage | null {
    const cleaned = stripControlChars(rawText).slice(0, 240).trim();
    if (!cleaned) return null;
    const now = Date.now();
    const arr = room.rateLimit.get(socketId) ?? [];
    const recent = arr.filter((t) => now - t < 10_000);
    if (recent.length >= 5) return null;
    recent.push(now);
    room.rateLimit.set(socketId, recent);
    const msg: ChatMessage = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      from: name,
      fromSpectator,
      text: cleaned,
      ts: now,
    };
    room.chatLog.push(msg);
    if (room.chatLog.length > 200) room.chatLog.shift();
    return msg;
  }
}

export const roomManager = new RoomManager();
