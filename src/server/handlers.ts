import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { applyAction, createGame } from './engine/game';
import { chooseBotAction } from './engine/bot';
import { redactState } from './engine/redact';
import { roomManager, nextHostPlayerId, stripControlChars, Room } from './rooms';
import {
  ClientToServerEvents,
  MatchRecord,
  PlayerMatchStat,
  RoomListEntry,
  RoomSnapshot,
  ServerToClientEvents,
} from '@/lib/shared-types';
import {
  ALL_SUITS,
  TEAM_OF,
  type Action,
  type HandSummary,
  type SeatIndex,
  type Suit,
} from './engine/types';
import { deleteMatch, getMatches, recordMatch } from './stats-store';
import { buildManualMatch, validateManualInput } from '@/lib/manual-match';
import { slimMatchForList } from '@/lib/stats-hands';
import { isStatsAdmin } from '@/lib/stats-auth';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type S = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Per-socket session (set during room:join). */
type Session = {
  roomCode: string;
  playerId: string;
  name: string;
  isSpectator: boolean;
};
const sessions = new Map<string, Session>();

// ---------------------------------------------------------------------------
// Input validation. Everything a client sends is untrusted JSON: a missing or
// wrong-typed field used to throw inside the listener, and socket.io dispatches
// listeners with no try/catch, so one bad packet crashed the whole server.
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isSeat = (v: unknown): v is SeatIndex => v === 0 || v === 1 || v === 2 || v === 3;
const isSuit = (v: unknown): v is Suit => typeof v === 'string' && (ALL_SUITS as string[]).includes(v);
/** Card ids are `${rank}${suit}`, e.g. "10H" — the engine still checks it's in hand. */
const isCardId = (v: unknown): v is string => typeof v === 'string' && /^(9|10|J|Q|K|A)[HDCS]$/.test(v);
const isPlayerId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);
const isRoomCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{0,8}$/.test(v);

type Ack<T> = (res: T) => void;
/** Clients may omit the ack callback; never call something that isn't a function. */
function safeAck<T>(ack: unknown): Ack<T> {
  return typeof ack === 'function' ? (ack as Ack<T>) : () => {};
}

/** Register a listener that can never take the process down: sync throws are
 *  caught, returned promises get a `.catch`. */
function on<E extends keyof ClientToServerEvents>(
  socket: S,
  event: E,
  handler: (...args: Parameters<ClientToServerEvents[E]>) => void | Promise<void>
): void {
  const wrapped = (...args: unknown[]) => {
    try {
      const r = handler(...(args as Parameters<ClientToServerEvents[E]>));
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch((e) => logHandlerError(event, e));
      }
    } catch (e) {
      logHandlerError(event, e);
    }
  };
  // socket.io's overloads can't express a generic wrapper; the cast is confined here.
  (socket as unknown as { on: (ev: string, fn: (...a: unknown[]) => void) => void }).on(event, wrapped);
}

function logHandlerError(event: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.error(`socket handler ${event} failed:`, e instanceof Error ? e.message : e);
}

// ---------------------------------------------------------------------------
// Per-IP limiters. Keyed by client address (not socket id) so reconnecting
// doesn't reset the budget. Render sits behind a proxy → honour X-Forwarded-For.
// ---------------------------------------------------------------------------

function clientIp(socket: S): string {
  const xff = socket.handshake.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || socket.handshake.address || 'unknown';
}

class WindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
  prune() {
    const now = Date.now();
    for (const [k, v] of this.hits) {
      if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    }
  }
}

const statWriteLimiter = new WindowLimiter(20, 60_000); // manual entries + deletes
const statReadLimiter = new WindowLimiter(30, 60_000); // full-history reads
const roomCreateLimiter = new WindowLimiter(10, 60_000);

/** Failed admin-key attempts per IP with exponential lockout (caps at 15 min). */
const authFailures = new Map<string, { count: number; lockedUntil: number }>();
function authLocked(ip: string): boolean {
  const f = authFailures.get(ip);
  return !!f && f.lockedUntil > Date.now();
}
function noteAuthFailure(ip: string) {
  const f = authFailures.get(ip) ?? { count: 0, lockedUntil: 0 };
  f.count++;
  const lockMs = Math.min(1000 * 2 ** f.count, 15 * 60_000);
  f.lockedUntil = Date.now() + lockMs;
  authFailures.set(ip, f);
  // eslint-disable-next-line no-console
  console.warn(`stats admin auth failed from ${ip} (attempt ${f.count}, locked ${lockMs}ms)`);
}
function noteAuthSuccess(ip: string) {
  authFailures.delete(ip);
}

setInterval(() => {
  statWriteLimiter.prune();
  statReadLimiter.prune();
  roomCreateLimiter.prune();
  const now = Date.now();
  for (const [k, v] of authFailures) if (v.lockedUntil < now - 60 * 60_000) authFailures.delete(k);
}, 5 * 60_000).unref();

// ---------------------------------------------------------------------------
// Seat reclaim tokens. A playerId is visible to everyone in the room (it's in
// the snapshot), so on its own it must never be enough to take over a seat.
// ---------------------------------------------------------------------------

const newToken = () => randomBytes(16).toString('hex');
function tokenMatches(expected: string, given: unknown): boolean {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------

function snapshot(room: Room, viewerSeat: SeatIndex | null): RoomSnapshot {
  return {
    code: room.code,
    members: roomManager.members(room),
    hostPlayerId: room.hostPlayerId,
    spectatorCount: room.spectators.length,
    full: room.seats.every((s) => !!s),
    state: redactState(room.state, viewerSeat),
  };
}

function broadcast(io: IO, room: Room) {
  // Send each seated player their personal view.
  for (let i = 0; i < 4; i++) {
    const seat = room.seats[i];
    if (seat?.socketId) {
      io.to(seat.socketId).emit('room:snapshot', snapshot(room, i as SeatIndex));
    }
  }
  // Send each spectator the spectator view (no hands).
  for (const sp of room.spectators) {
    io.to(sp.socketId).emit('room:snapshot', snapshot(room, null));
  }
  // Track trick completion here (not only when a bot is on turn) so the
  // post-trick animation delay fires for the right move.
  const currCount = room.state.completedTricks.length;
  room.trickJustCompleted = currCount > room.lastTrickCount;
  room.lastTrickCount = currCount;
  // Possibly schedule a bot move.
  scheduleBotTick(io, room);
  // Auto-advance from HAND_END after the score has been shown.
  scheduleAutoNextHand(io, room);
  // Auto-play for an absent/idle human so the game never freezes on their turn.
  scheduleHumanTurnTimer(io, room);
  // Record the finished game for all-time stats (exactly once).
  if (room.state.phase === 'GAME_OVER' && !room.statsRecorded) {
    room.statsRecorded = true;
    try {
      const record = buildMatchRecord(room);
      // Fire-and-forget: persistence shouldn't block the broadcast.
      recordMatch(record).catch((e) => {
        // eslint-disable-next-line no-console
        console.error('failed to persist match:', (e as Error).message);
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('failed to build match record:', (e as Error).message);
    }
  }
}

/** Apply an engine action, emit its events, rebroadcast. Errors go to `onError`
 *  (a `room:error` for a human, the log for a timer). Returns whether it applied. */
function applyAndBroadcast(
  io: IO,
  room: Room,
  action: Action,
  onError: (msg: string) => void
): boolean {
  try {
    const { state, events } = applyAction(room.state, action);
    room.state = state;
    events.forEach((e) => io.to(room.code).emit('room:event', e));
    broadcast(io, room);
    return true;
  } catch (e) {
    onError((e as Error).message);
    return false;
  }
}

const SEAT_FALLBACK = ['South', 'West', 'North', 'East'] as const;

/** Build a MatchRecord from a finished room's per-hand history. */
function buildMatchRecord(room: Room): MatchRecord {
  const history = room.state.history;
  const players: PlayerMatchStat[] = ([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
    const seatData = room.seats[seat];
    const team = TEAM_OF[seat];
    let tricks = 0;
    let defensiveTricks = 0;
    let defensiveEuchres = 0;
    let handsCalled = 0;
    let callsWon = 0;
    let euchres = 0;
    let marches = 0;
    let loneCalled = 0;
    let loneWon = 0;
    for (const h of history) {
      const t = h.tricksBySeat[seat] ?? 0;
      tricks += t;
      if (h.maker === seat) {
        handsCalled++;
        if (!h.euchred) callsWon++;
        else euchres++;
        if (h.march && !h.euchred) marches++;
        if (h.alone) {
          loneCalled++;
          if (!h.euchred) loneWon++;
        }
      } else if (TEAM_OF[h.maker] !== team) {
        // Only the DEFENDING team's tricks count as defensive — the maker's
        // partner's tricks are attacking, not defensive.
        defensiveTricks += t;
        if (h.euchred) defensiveEuchres++; // we euchred the maker while defending
      }
    }
    return {
      name: seatData?.name ?? SEAT_FALLBACK[seat],
      seat,
      team,
      isBot: seatData?.isBot ?? false,
      tricks,
      defensiveTricks,
      defensiveEuchres,
      handsCalled,
      callsWon,
      euchres,
      marches,
      loneCalled,
      loneWon,
    };
  });
  const winnerTeam = room.state.scores.NS > room.state.scores.EW ? 'NS' : 'EW';
  return {
    id: `${Date.now()}-${room.code}`,
    ts: Date.now(),
    winnerTeam,
    finalScore: { ...room.state.scores },
    handsPlayed: history.length,
    players,
    startedTs: room.startedTs,
    rules: { pointsToWin: 10, stickTheDealer: true },
    hands: history,
  };
}

const HAND_END_AUTO_DELAY_MS = 6000;

function scheduleAutoNextHand(io: IO, room: Room) {
  if (room.handEndTimer) {
    clearTimeout(room.handEndTimer);
    room.handEndTimer = null;
  }
  if (room.state.phase !== 'HAND_END') return;
  room.handEndTimer = setTimeout(() => {
    room.handEndTimer = null;
    if (!roomManager.get(room.code)) return; // room gone
    if (room.state.phase !== 'HAND_END') return; // already advanced
    applyAndBroadcast(io, room, { type: 'START_HAND' }, (msg) => {
      // eslint-disable-next-line no-console
      console.error(`auto-next-hand failed in room ${room.code}:`, msg);
    });
  }, HAND_END_AUTO_DELAY_MS);
}

const BOT_DELAY_MS = 700;
/** After a trick is taken we delay so the client animation has time to play. */
const POST_TRICK_DELAY_MS = 2100;

const ACTIONABLE_PHASES = new Set(['BIDDING_1', 'BIDDING_2', 'DEALER_DISCARD', 'PLAYING']);

function scheduleBotTick(io: IO, room: Room) {
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
  // Bots only act in turn-based phases.
  if (!ACTIONABLE_PHASES.has(room.state.phase)) return;
  const turnSeat = room.state.turn;
  const seated = room.seats[turnSeat];
  if (!seated || !seated.isBot) return;
  // Never act for a sitting-out seat. The engine no longer parks the turn on one:
  // a sitting-out dealer's discard is resolved at order-up time (see BID_ORDER).
  if (room.state.sittingOut.includes(turnSeat)) return;

  const delay = room.trickJustCompleted ? POST_TRICK_DELAY_MS : BOT_DELAY_MS;

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!roomManager.get(room.code)) return; // room gone
    // Re-validate: still this bot's turn in an actionable phase.
    if (!ACTIONABLE_PHASES.has(room.state.phase) || room.state.turn !== turnSeat) return;
    const s = room.seats[turnSeat];
    if (!s || !s.isBot) return;
    let action: Action;
    try {
      action = chooseBotAction(room.state, turnSeat);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`bot error in room ${room.code}:`, (e as Error).message);
      return;
    }
    applyAndBroadcast(io, room, action, (msg) => {
      // eslint-disable-next-line no-console
      console.error(`bot error in room ${room.code}:`, msg);
    });
  }, delay);
}

// A *present* player has unlimited time to act — we never auto-play for them.
// The only safety net is for a seat whose human has DISCONNECTED: after a short
// grace (enough to reconnect from a refresh / dropped wifi) a bot plays their
// turn so the table doesn't freeze waiting on someone who's gone.
const DISCONNECTED_TURN_MS = 20_000;

function scheduleHumanTurnTimer(io: IO, room: Room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  if (!ACTIONABLE_PHASES.has(room.state.phase)) return;
  const turnSeat = room.state.turn;
  const seated = room.seats[turnSeat];
  if (!seated || seated.isBot) return; // bots are handled by scheduleBotTick
  // Never auto-play for a sitting-out seat; the turn never lands on one.
  if (room.state.sittingOut.includes(turnSeat)) return;
  if (seated.socketId) return; // connected human → unlimited time, no auto-play

  room.turnTimer = setTimeout(() => {
    room.turnTimer = null;
    if (!roomManager.get(room.code)) return; // room gone
    // Re-validate: still the same human's turn in an actionable phase. (Any state
    // change reschedules this timer, so normally nothing has changed.)
    if (!ACTIONABLE_PHASES.has(room.state.phase) || room.state.turn !== turnSeat) return;
    const s = room.seats[turnSeat];
    if (!s || s.isBot) return;
    let action: Action;
    try {
      action = chooseBotAction(room.state, turnSeat);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`auto-play (absent human) failed in room ${room.code}:`, (e as Error).message);
      return;
    }
    applyAndBroadcast(io, room, action, (msg) => {
      // eslint-disable-next-line no-console
      console.error(`auto-play (absent human) failed in room ${room.code}:`, msg);
    });
  }, DISCONNECTED_TURN_MS);
}

function makeBotName(usedNames: Set<string>): string {
  const pool = ['Maggie', 'Jen Scalia', 'Brianne Nestor', 'Danielle Lee'];
  for (const n of pool) {
    if (!usedNames.has(n)) return n;
  }
  return `Bot ${Math.floor(Math.random() * 999)}`;
}

function botIdFor(seat: number): string {
  return `bot-${seat}-${Math.random().toString(36).slice(2, 10)}`;
}

function botSeat(room: Room, seat: SeatIndex) {
  const used = new Set(room.seats.filter((s) => s).map((s) => s!.name));
  return {
    playerId: botIdFor(seat),
    name: makeBotName(used),
    token: '', // bots can never be reclaimed via room:join
    socketId: null,
    disconnectedAt: null,
    isBot: true,
  };
}

function err(socket: S, msg: string) {
  socket.emit('room:error', msg);
}

function getSessionRoom(socket: S): { sess: Session; room: Room } | null {
  const sess = sessions.get(socket.id);
  if (!sess) return null;
  const room = roomManager.get(sess.roomCode);
  if (!room) return null;
  return { sess, room };
}

function getSeatedSession(
  socket: S
): { sess: Session; room: Room; seat: SeatIndex } | null {
  const ctx = getSessionRoom(socket);
  if (!ctx) return null;
  const seat = roomManager.findSeat(ctx.room, ctx.sess.playerId);
  if (seat == null) return null;
  return { ...ctx, seat };
}

/** Host-only lobby action guard. Returns the room or emits the reason. */
function hostLobbyRoom(socket: S, what: string): Room | null {
  const ctx = getSessionRoom(socket);
  if (!ctx) {
    err(socket, 'not in a room');
    return null;
  }
  const { room, sess } = ctx;
  if (room.hostPlayerId !== sess.playerId) {
    err(socket, 'host only');
    return null;
  }
  if (room.state.phase !== 'LOBBY') {
    err(socket, `cannot ${what} mid-game`);
    return null;
  }
  return room;
}

/** Seated-player game action: validate, apply, broadcast; errors → room:error. */
function playerAction(socket: S, build: (seat: SeatIndex) => Action | null, io: IO) {
  const ctx = getSeatedSession(socket);
  if (!ctx) return err(socket, 'spectators cannot play');
  const action = build(ctx.seat);
  if (!action) return err(socket, 'invalid request');
  applyAndBroadcast(io, ctx.room, action, (msg) => err(socket, msg));
}

function listRooms(): RoomListEntry[] {
  return roomManager
    .list()
    // Only show rooms that have at least one connected human (or a spectator) —
    // a room left with only bots is effectively abandoned.
    .filter((room) => {
      const connectedHumans = room.seats.filter(
        (s) => s && !s.isBot && s.socketId
      ).length;
      return connectedHumans > 0 || room.spectators.length > 0;
    })
    .map((room) => {
      const members = roomManager.members(room).map((m) => ({
        name: m.name,
        seat: m.seat,
        isBot: m.isBot,
      }));
      const seated = members.filter((m) => m.seat !== null);
      return {
        code: room.code,
        phase: room.state.phase,
        members,
        seatedCount: seated.length,
        full: seated.length === 4,
        spectatorCount: room.spectators.length,
      };
    });
}

export function attachHandlers(io: IO) {
  io.on('connection', (socket: S) => {
    on(socket, 'rooms:list', (rawAck) => {
      const ack = safeAck<RoomListEntry[]>(rawAck);
      try {
        ack(listRooms());
      } catch {
        ack([]);
      }
    });

    on(socket, 'stats:get', async (rawAck) => {
      const ack = safeAck<Parameters<typeof rawAck>[0]>(rawAck);
      if (!statReadLimiter.allow(clientIp(socket))) {
        return ack({ matches: [], totalMatches: 0 });
      }
      try {
        const all = await getMatches();
        // Most recent first, with each hand slimmed to its summary. The dashboard
        // derives every metric from summaries; the heavy per-card bids/tricks load
        // on demand via `stats:hands` when the full data set is expanded.
        const recent = all.slice().reverse().map(slimMatchForList);
        ack({ matches: recent, totalMatches: all.length });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('stats:get failed:', (e as Error).message);
        ack({ matches: [], totalMatches: 0 });
      }
    });

    // Heavy per-hand detail (bids + tricks) for the expandable hand-level view.
    on(socket, 'stats:hands', async (rawAck) => {
      const ack = safeAck<Parameters<typeof rawAck>[0]>(rawAck);
      if (!statReadLimiter.allow(clientIp(socket))) return ack({ games: [] });
      try {
        const all = await getMatches();
        const games = all
          .filter((m) => m.hands && m.hands.length)
          .map((m) => ({ id: m.id, hands: m.hands as HandSummary[] }));
        ack({ games });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('stats:hands failed:', (e as Error).message);
        ack({ games: [] });
      }
    });

    // Log an in-person game manually. Gated behind the shared stats admin key —
    // the leaderboard is the club's permanent record.
    on(socket, 'stats:add', async (payload, rawAck) => {
      const ack = safeAck<Parameters<typeof rawAck>[0]>(rawAck);
      const ip = clientIp(socket);
      if (!statWriteLimiter.allow(ip)) {
        return ack({ ok: false, error: 'Too many entries in a short time — give it a moment.' });
      }
      if (!isObj(payload)) return ack({ ok: false, error: 'Missing data.' });
      if (authLocked(ip)) {
        return ack({ ok: false, error: 'Too many failed key attempts — try again later.', code: 'auth' });
      }
      const { key, ...input } = payload;
      if (!isStatsAdmin(key)) {
        noteAuthFailure(ip);
        return ack({ ok: false, error: 'Not authorized — enter the admin key to log games.', code: 'auth' });
      }
      noteAuthSuccess(ip);
      try {
        const invalid = validateManualInput(input);
        if (invalid) return ack({ ok: false, error: invalid });
        const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await recordMatch(buildManualMatch(input, id, Date.now()));
        ack({ ok: true });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('stats:add failed:', (e as Error).message);
        ack({ ok: false, error: 'Could not save the game. Please try again.' });
      }
    });

    // Delete a recorded game (e.g. a mistaken manual entry).
    on(socket, 'stats:delete', async (payload, rawAck) => {
      const ack = safeAck<Parameters<typeof rawAck>[0]>(rawAck);
      const ip = clientIp(socket);
      if (!statWriteLimiter.allow(ip)) {
        return ack({ ok: false, error: 'Too many requests — give it a moment.' });
      }
      if (!isObj(payload)) return ack({ ok: false, error: 'Missing game id.' });
      if (authLocked(ip)) {
        return ack({ ok: false, error: 'Too many failed key attempts — try again later.', code: 'auth' });
      }
      if (!isStatsAdmin(payload.key)) {
        noteAuthFailure(ip);
        return ack({ ok: false, error: 'Not authorized — enter the admin key to delete games.', code: 'auth' });
      }
      noteAuthSuccess(ip);
      const id = payload.id;
      if (typeof id !== 'string' || !id || id.length > 64) return ack({ ok: false, error: 'Missing game id.' });
      try {
        const removed = await deleteMatch(id);
        // eslint-disable-next-line no-console
        console.log(`stats: match ${id} ${removed ? 'deleted' : 'not found'} (from ${ip})`);
        ack(removed ? { ok: true } : { ok: false, error: 'That game was not found.' });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('stats:delete failed:', (e as Error).message);
        ack({ ok: false, error: 'Could not delete the game. Please try again.' });
      }
    });

    on(socket, 'room:join', (payload, rawAck) => {
      const ack = safeAck<Parameters<typeof rawAck>[0]>(rawAck);
      if (!isObj(payload)) return ack({ ok: false, error: 'bad request' });
      if (!isRoomCode(payload.code ?? '')) return ack({ ok: false, error: 'Room not found' });
      const code = ((payload.code as string) || '').toUpperCase().trim();
      const rawName = typeof payload.name === 'string' ? payload.name : '';
      const name = stripControlChars(rawName).slice(0, 24).trim() || 'Player';
      const playerId = payload.playerId;
      if (!isPlayerId(playerId)) return ack({ ok: false, error: 'missing playerId' });

      let room = code ? roomManager.get(code) : undefined;
      if (code && !room) return ack({ ok: false, error: 'Room not found' });
      if (!room) {
        if (!roomCreateLimiter.allow(clientIp(socket))) {
          return ack({ ok: false, error: 'You are creating rooms too quickly — wait a minute.' });
        }
        try {
          room = roomManager.create(playerId);
        } catch (e) {
          return ack({ ok: false, error: (e as Error).message });
        }
      }

      // Existing registrations of this playerId in the room. Reclaiming one
      // requires the token we handed out at first join — the playerId alone is
      // public (it's in every snapshot) and must not be enough.
      const existingSeat = roomManager.findSeat(room, playerId);
      const existingSpec = room.spectators.findIndex((sp) => sp.playerId === playerId);
      const existing =
        existingSeat != null ? room.seats[existingSeat] : existingSpec >= 0 ? room.spectators[existingSpec] : null;
      let token: string;
      if (existing) {
        if (!tokenMatches(existing.token, payload.token)) {
          return ack({ ok: false, error: 'That seat belongs to another connection.' });
        }
        token = existing.token;
      } else {
        token = newToken();
      }

      if (payload.asSpectator) {
        // Remove any existing seat (only allowed in lobby).
        if (existingSeat != null) {
          if (room.state.phase !== 'LOBBY') {
            return ack({ ok: false, error: 'Cannot move to spectator mid-hand' });
          }
          room.seats[existingSeat] = null;
        }
        if (existingSpec >= 0) room.spectators.splice(existingSpec, 1);
        room.spectators.push({ playerId, name, token, socketId: socket.id });
      } else {
        // Player intent.
        if (existingSpec >= 0) room.spectators.splice(existingSpec, 1);
        if (existingSeat != null) {
          // Reconnect: just update name + socket.
          room.seats[existingSeat] = {
            playerId,
            name,
            token,
            socketId: socket.id,
            disconnectedAt: null,
            isBot: false,
          };
        } else {
          const seatIdx = roomManager.firstOpenSeat(room);
          if (seatIdx == null) {
            // Auto-fallback to spectator if room is full.
            room.spectators.push({ playerId, name, token, socketId: socket.id });
          } else {
            room.seats[seatIdx] = {
              playerId,
              name,
              token,
              socketId: socket.id,
              disconnectedAt: null,
              isBot: false,
            };
          }
        }
      }

      // Repair a lost host: if whoever is on record no longer holds a seat, hand
      // it to a seated human. Only fires when the recorded host is unseated, so it
      // never steals from a seated host — and it rescues rooms whose hostPlayerId
      // was emptied when the last host left, which left nobody able to add bots.
      if (!room.seats.some((s) => s && !s.isBot && s.playerId === room.hostPlayerId)) {
        const repaired = nextHostPlayerId(room);
        if (repaired) room.hostPlayerId = repaired;
      }

      sessions.set(socket.id, {
        roomCode: room.code,
        playerId,
        name,
        isSpectator: roomManager.findSeat(room, playerId) == null,
      });
      socket.join(room.code);

      // Send chat history to the joiner.
      for (const m of room.chatLog) socket.emit('chat:msg', m);

      const seat = roomManager.findSeat(room, playerId);
      ack({ ok: true, snapshot: snapshot(room, seat), token });
      broadcast(io, room);
    });

    on(socket, 'room:start', () => {
      // Any seated player can start once the table is full — host-gating this just
      // stranded tables whose host had drifted to someone else (or to nobody).
      const ctx = getSeatedSession(socket);
      if (!ctx) return err(socket, 'only seated players can start');
      const { room } = ctx;
      if (!room.seats.every((s) => !!s)) return err(socket, 'need 4 players');
      if (room.state.phase !== 'LOBBY') return err(socket, 'already started');
      room.startedTs = Date.now();
      applyAndBroadcast(io, room, { type: 'START_HAND' }, (msg) => err(socket, msg));
    });

    on(socket, 'room:nextHand', () => {
      const ctx = getSeatedSession(socket);
      if (!ctx) return err(socket, 'only seated players can advance');
      const { room } = ctx;
      if (room.state.phase !== 'HAND_END') return err(socket, 'no hand to advance');
      applyAndBroadcast(io, room, { type: 'START_HAND' }, (msg) => err(socket, msg));
    });

    on(socket, 'room:rematch', () => {
      // Reset a finished game back to the lobby, keeping every seat (players +
      // bots) so the same group can play again. The lobby lets people confirm
      // seats / swap bots before the host starts the next game.
      const ctx = getSeatedSession(socket);
      if (!ctx) return err(socket, 'only players can rematch');
      const { room } = ctx;
      if (room.state.phase !== 'GAME_OVER') return err(socket, 'game is not over');
      for (const key of ['botTimer', 'handEndTimer', 'turnTimer'] as const) {
        const t = room[key];
        if (t) clearTimeout(t);
        room[key] = null;
      }
      room.state = createGame();
      room.statsRecorded = false;
      room.lastTrickCount = 0;
      room.trickJustCompleted = false;
      io.to(room.code).emit('room:event', 'rematch');
      broadcast(io, room);
    });

    on(socket, 'room:promote', (payload) => {
      if (!isObj(payload)) return err(socket, 'invalid request');
      const { playerId, seat } = payload;
      if (!isSeat(seat) || !isPlayerId(playerId)) return err(socket, 'invalid request');
      const ctx = getSessionRoom(socket);
      if (!ctx) return err(socket, 'not in a room');
      const { room, sess } = ctx;
      if (room.hostPlayerId !== sess.playerId) return err(socket, 'host only');
      if (room.state.phase !== 'LOBBY' && room.state.phase !== 'HAND_END')
        return err(socket, 'cannot promote mid-hand');
      if (room.seats[seat]) return err(socket, 'seat occupied');
      const sp = room.spectators.find((s) => s.playerId === playerId);
      if (!sp) return err(socket, 'spectator not found');
      room.spectators = room.spectators.filter((s) => s !== sp);
      room.seats[seat] = {
        playerId: sp.playerId,
        name: sp.name,
        token: sp.token,
        socketId: sp.socketId,
        disconnectedAt: null,
        isBot: false,
      };
      const promoSession = Array.from(sessions.entries()).find(
        ([, v]) => v.playerId === sp.playerId && v.roomCode === room.code
      );
      if (promoSession) sessions.set(promoSession[0], { ...promoSession[1], isSpectator: false });
      broadcast(io, room);
    });

    on(socket, 'room:moveSeat', (payload) => {
      if (!isObj(payload) || !isSeat(payload.seat)) return err(socket, 'invalid seat');
      const targetSeat = payload.seat;
      const ctx = getSessionRoom(socket);
      if (!ctx) return err(socket, 'not in a room');
      const { room, sess } = ctx;
      if (room.state.phase !== 'LOBBY') return err(socket, 'cannot change seats mid-game');
      const currentSeat = roomManager.findSeat(room, sess.playerId);
      if (currentSeat == null) return err(socket, 'spectators cannot move seats');
      if (currentSeat === targetSeat) return; // no-op
      if (room.seats[targetSeat]) return err(socket, 'seat is taken');
      const seatData = room.seats[currentSeat]!;
      room.seats[targetSeat] = seatData;
      room.seats[currentSeat] = null;
      broadcast(io, room);
    });

    on(socket, 'room:addBot', (payload) => {
      const wanted = isObj(payload) ? payload.seat : undefined;
      if (wanted !== undefined && wanted !== null && !isSeat(wanted)) return err(socket, 'invalid seat');
      const room = hostLobbyRoom(socket, 'add bot');
      if (!room) return;
      const target = isSeat(wanted) ? wanted : roomManager.firstOpenSeat(room);
      if (target == null) return err(socket, 'no open seats');
      if (room.seats[target]) return err(socket, 'seat already taken');
      room.seats[target] = botSeat(room, target);
      broadcast(io, room);
    });

    on(socket, 'room:fillBots', () => {
      const room = hostLobbyRoom(socket, 'add bots');
      if (!room) return;
      for (let i = 0; i < 4; i++) {
        if (!room.seats[i]) room.seats[i] = botSeat(room, i as SeatIndex);
      }
      broadcast(io, room);
    });

    on(socket, 'room:removeBot', (payload) => {
      if (!isObj(payload) || !isSeat(payload.seat)) return err(socket, 'invalid seat');
      const room = hostLobbyRoom(socket, 'remove bot');
      if (!room) return;
      const s = room.seats[payload.seat];
      if (!s || !s.isBot) return err(socket, 'no bot in that seat');
      room.seats[payload.seat] = null;
      broadcast(io, room);
    });

    on(socket, 'bid:order', (payload) => {
      const alone = isObj(payload) && payload.alone === true;
      playerAction(socket, (seat) => ({ type: 'BID_ORDER', seat, alone }), io);
    });

    on(socket, 'bid:pass', () => {
      playerAction(socket, (seat) => ({ type: 'BID_PASS', seat }), io);
    });

    on(socket, 'bid:call', (payload) => {
      if (!isObj(payload) || !isSuit(payload.suit)) return err(socket, 'invalid suit');
      const suit = payload.suit;
      const alone = payload.alone === true;
      playerAction(socket, (seat) => ({ type: 'BID_CALL', seat, suit, alone }), io);
    });

    on(socket, 'farmers:redeal', () => {
      playerAction(socket, (seat) => ({ type: 'FARMERS_REDEAL', seat }), io);
    });

    on(socket, 'discard:card', (payload) => {
      if (!isObj(payload) || !isCardId(payload.cardId)) return err(socket, 'invalid card');
      const cardId = payload.cardId;
      playerAction(socket, (seat) => ({ type: 'DEALER_DISCARD', seat, cardId }), io);
    });

    on(socket, 'play:card', (payload) => {
      if (!isObj(payload) || !isCardId(payload.cardId)) return err(socket, 'invalid card');
      const cardId = payload.cardId;
      playerAction(socket, (seat) => ({ type: 'PLAY_CARD', seat, cardId }), io);
    });

    on(socket, 'chat:send', (payload) => {
      if (!isObj(payload) || typeof payload.text !== 'string') return;
      const ctx = getSessionRoom(socket);
      if (!ctx) return;
      const { room, sess } = ctx;
      const msg = roomManager.postChat(room, sess.playerId, sess.name, sess.isSpectator, payload.text);
      if (msg) io.to(room.code).emit('chat:msg', msg);
    });

    on(socket, 'room:leave', () => {
      // Intentional leave: remove the player immediately (no reconnect grace).
      const ctx = getSessionRoom(socket);
      if (ctx) {
        const { room, sess } = ctx;
        const seat = roomManager.findSeat(room, sess.playerId);
        if (seat != null) {
          const midGame =
            room.state.phase !== 'LOBBY' && room.state.phase !== 'GAME_OVER';
          const othersRemain =
            room.seats.some(
              (s, i) => i !== seat && s && !s.isBot && s.socketId
            ) || room.spectators.length > 0;
          if (midGame && othersRemain) {
            // Don't leave an empty seat mid-hand — the game would stall on its
            // turn. A bot takes over so everyone else can keep playing.
            room.seats[seat] = botSeat(room, seat);
          } else {
            room.seats[seat] = null;
          }
        }
        room.spectators = room.spectators.filter((sp) => sp.playerId !== sess.playerId);
        room.rateLimit.delete(sess.playerId);
        // Hand off host to a remaining human if needed.
        if (room.hostPlayerId === sess.playerId) {
          room.hostPlayerId = nextHostPlayerId(room);
        }
        // A room with only bots (or nobody) left should not linger on the
        // home page — delete it so it stops showing as "in progress".
        const connectedHumans = room.seats.filter(
          (s) => s && !s.isBot && s.socketId
        ).length;
        if (connectedHumans === 0 && room.spectators.length === 0) {
          roomManager.delete(room.code);
        } else {
          broadcast(io, room);
        }
      }
      sessions.delete(socket.id);
      socket.disconnect(true);
    });

    socket.on('disconnect', () => {
      sessions.delete(socket.id);
      try {
        roomManager.handleDisconnect(socket.id, (room) => broadcast(io, room));
      } catch (e) {
        logHandlerError('disconnect', e);
      }
    });
  });
}
