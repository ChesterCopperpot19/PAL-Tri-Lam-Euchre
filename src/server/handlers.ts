import type { Server, Socket } from 'socket.io';
import { applyAction } from './engine/game';
import { chooseBotAction } from './engine/bot';
import { redactState } from './engine/redact';
import { roomManager, Room } from './rooms';
import {
  ClientToServerEvents,
  RoomListEntry,
  RoomSnapshot,
  ServerToClientEvents,
} from '@/lib/shared-types';

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

function snapshot(room: Room, viewerSeat: 0 | 1 | 2 | 3 | null): RoomSnapshot {
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
      io.to(seat.socketId).emit('room:snapshot', snapshot(room, i as 0 | 1 | 2 | 3));
    }
  }
  // Send each spectator the spectator view (no hands).
  for (const sp of room.spectators) {
    io.to(sp.socketId).emit('room:snapshot', snapshot(room, null));
  }
  // Possibly schedule a bot move.
  scheduleBotTick(io, room);
  // Auto-advance from HAND_END after the score has been shown.
  scheduleAutoNextHand(io, room);
}

const HAND_END_AUTO_DELAY_MS = 3000;

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
    try {
      const { state, events } = applyAction(room.state, { type: 'START_HAND' });
      room.state = state;
      events.forEach((e) => io.to(room.code).emit('room:event', e));
      broadcast(io, room);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`auto-next-hand failed in room ${room.code}:`, (e as Error).message);
    }
  }, HAND_END_AUTO_DELAY_MS);
}

const BOT_DELAY_MS = 700;
/** After a trick is taken we delay so the client animation has time to play. */
const POST_TRICK_DELAY_MS = 2100;

const lastTrickCountByRoom = new Map<string, number>();

function scheduleBotTick(io: IO, room: Room) {
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
  // Bots only act in turn-based phases.
  const phase = room.state.phase;
  const actionable =
    phase === 'BIDDING_1' ||
    phase === 'BIDDING_2' ||
    phase === 'DEALER_DISCARD' ||
    phase === 'PLAYING';
  if (!actionable) return;
  const turnSeat = room.state.turn;
  const seated = room.seats[turnSeat];
  if (!seated || !seated.isBot) return;
  if (room.state.sittingOut.includes(turnSeat as 0 | 1 | 2 | 3)) return;

  // Detect: did a trick just complete? (completedTricks grew since last call.)
  const prevCount = lastTrickCountByRoom.get(room.code) ?? 0;
  const currCount = room.state.completedTricks.length;
  lastTrickCountByRoom.set(room.code, currCount);
  const justWonTrick = currCount > prevCount;
  const delay = justWonTrick ? POST_TRICK_DELAY_MS : BOT_DELAY_MS;

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!roomManager.get(room.code)) return; // room gone
    try {
      const action = chooseBotAction(room.state, turnSeat as 0 | 1 | 2 | 3);
      const { state, events } = applyAction(room.state, action);
      room.state = state;
      events.forEach((e) => io.to(room.code).emit('room:event', e));
      broadcast(io, room);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`bot error in room ${room.code}:`, (e as Error).message);
    }
  }, delay);
}

function makeBotName(usedNames: Set<string>): string {
  const pool = ['Maggie', 'Giles', 'Gabe Ryan', 'Carbonic Jim'];
  for (const n of pool) {
    if (!usedNames.has(n)) return n;
  }
  return `Bot ${Math.floor(Math.random() * 999)}`;
}

function botIdFor(seat: number): string {
  return `bot-${seat}-${Math.random().toString(36).slice(2, 10)}`;
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
): { sess: Session; room: Room; seat: 0 | 1 | 2 | 3 } | null {
  const ctx = getSessionRoom(socket);
  if (!ctx) return null;
  const seat = roomManager.findSeat(ctx.room, ctx.sess.playerId);
  if (seat == null) return null;
  return { ...ctx, seat };
}

function listRooms(): RoomListEntry[] {
  return roomManager.list().map((room) => {
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
    socket.on('rooms:list', (ack) => {
      try {
        ack(listRooms());
      } catch (e) {
        ack([]);
      }
    });

    socket.on('room:join', (payload, ack) => {
      try {
        const code = (payload.code || '').toUpperCase().trim();
        const name = (payload.name || 'Player').slice(0, 24).trim() || 'Player';
        const playerId = payload.playerId;
        if (!playerId) return ack({ ok: false, error: 'missing playerId' });

        let room = code ? roomManager.get(code) : undefined;
        if (code && !room) return ack({ ok: false, error: 'Room not found' });
        if (!room) {
          room = roomManager.create(playerId);
        }

        // Clean any stale registrations of this playerId across the room.
        const existingSeat = roomManager.findSeat(room, playerId);
        const existingSpec = room.spectators.findIndex((sp) => sp.playerId === playerId);

        if (payload.asSpectator) {
          // Remove any existing seat (only allowed in lobby).
          if (existingSeat != null) {
            if (room.state.phase !== 'LOBBY') {
              return ack({
                ok: false,
                error: 'Cannot move to spectator mid-hand',
              });
            }
            room.seats[existingSeat] = null;
          }
          if (existingSpec >= 0) room.spectators.splice(existingSpec, 1);
          room.spectators.push({ playerId, name, socketId: socket.id });
        } else {
          // Player intent.
          if (existingSpec >= 0) room.spectators.splice(existingSpec, 1);
          if (existingSeat != null) {
            // Reconnect: just update name + socket.
            room.seats[existingSeat] = {
              playerId,
              name,
              socketId: socket.id,
              disconnectedAt: null,
              isBot: false,
            };
          } else {
            const seatIdx = roomManager.firstOpenSeat(room);
            if (seatIdx == null) {
              // Auto-fallback to spectator if room is full.
              room.spectators.push({ playerId, name, socketId: socket.id });
            } else {
              room.seats[seatIdx] = {
                playerId,
                name,
                socketId: socket.id,
                disconnectedAt: null,
                isBot: false,
              };
              if (!room.seats.some((s) => s && s.playerId === room.hostPlayerId)) {
                room.hostPlayerId = playerId;
              }
            }
          }
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
        ack({ ok: true, snapshot: snapshot(room, seat) });
        broadcast(io, room);
      } catch (e) {
        ack({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('room:start', () => {
      const ctx = getSessionRoom(socket);
      if (!ctx) return err(socket, 'not in a room');
      const { room, sess } = ctx;
      if (room.hostPlayerId !== sess.playerId) return err(socket, 'host only');
      if (!room.seats.every((s) => !!s)) return err(socket, 'need 4 players');
      if (room.state.phase !== 'LOBBY') return err(socket, 'already started');
      try {
        const { state, events } = applyAction(room.state, { type: 'START_HAND' });
        room.state = state;
        events.forEach((e) => io.to(room.code).emit('room:event', e));
        broadcast(io, room);
      } catch (e) {
        err(socket, (e as Error).message);
      }
    });

    socket.on('room:nextHand', () => {
      const ctx = getSessionRoom(socket);
      if (!ctx) return err(socket, 'not in a room');
      const { room } = ctx;
      if (room.state.phase !== 'HAND_END') return err(socket, 'no hand to advance');
      try {
        const { state, events } = applyAction(room.state, { type: 'START_HAND' });
        room.state = state;
        events.forEach((e) => io.to(room.code).emit('room:event', e));
        broadcast(io, room);
      } catch (e) {
        err(socket, (e as Error).message);
      }
    });

    socket.on('room:promote', ({ playerId, seat }) => {
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
        socketId: sp.socketId,
        disconnectedAt: null,
        isBot: false,
      };
      const promoSession = Array.from(sessions.entries()).find(
        ([, v]) => v.playerId === sp.playerId
      );
      if (promoSession) sessions.set(promoSession[0], { ...promoSession[1], isSpectator: false });
      broadcast(io, room);
    });

    function addBotToSeat(room: Room, seat: 0 | 1 | 2 | 3): void {
      const used = new Set(room.seats.filter((s) => s).map((s) => s!.name));
      const name = makeBotName(used);
      room.seats[seat] = {
        playerId: botIdFor(seat),
        name,
        socketId: null,
        disconnectedAt: null,
        isBot: true,
      };
    }

    socket.on('room:moveSeat', ({ seat: targetSeat }) => {
      const ctx = getSessionRoom(socket);
      if (!ctx) return err(socket, 'not in a room');
      const { room, sess } = ctx;
      if (room.state.phase !== 'LOBBY')
        return err(socket, 'cannot change seats mid-game');
      if (targetSeat < 0 || targetSeat > 3) return err(socket, 'invalid seat');
      const currentSeat = roomManager.findSeat(room, sess.playerId);
      if (currentSeat == null) return err(socket, 'spectators cannot move seats');
      if (currentSeat === targetSeat) return; // no-op
      if (room.seats[targetSeat]) return err(socket, 'seat is taken');
      const seatData = room.seats[currentSeat]!;
      room.seats[targetSeat] = seatData;
      room.seats[currentSeat] = null;
      broadcast(io, room);
    });

    socket.on('room:addBot', ({ seat }) => {
      const ctx = getSessionRoom(socket);
      if (!ctx) return err(socket, 'not in a room');
      const { room, sess } = ctx;
      if (room.hostPlayerId !== sess.playerId) return err(socket, 'host only');
      if (room.state.phase !== 'LOBBY') return err(socket, 'cannot add bot mid-game');
      let target: 0 | 1 | 2 | 3 | null = seat ?? null;
      if (target == null) target = roomManager.firstOpenSeat(room);
      if (target == null) return err(socket, 'no open seats');
      if (room.seats[target]) return err(socket, 'seat already taken');
      addBotToSeat(room, target);
      broadcast(io, room);
    });

    socket.on('room:fillBots', () => {
      const ctx = getSessionRoom(socket);
      if (!ctx) return err(socket, 'not in a room');
      const { room, sess } = ctx;
      if (room.hostPlayerId !== sess.playerId) return err(socket, 'host only');
      if (room.state.phase !== 'LOBBY') return err(socket, 'cannot add bots mid-game');
      for (let i = 0; i < 4; i++) {
        if (!room.seats[i]) addBotToSeat(room, i as 0 | 1 | 2 | 3);
      }
      broadcast(io, room);
    });

    socket.on('room:removeBot', ({ seat }) => {
      const ctx = getSessionRoom(socket);
      if (!ctx) return err(socket, 'not in a room');
      const { room, sess } = ctx;
      if (room.hostPlayerId !== sess.playerId) return err(socket, 'host only');
      if (room.state.phase !== 'LOBBY') return err(socket, 'cannot remove bot mid-game');
      const s = room.seats[seat];
      if (!s || !s.isBot) return err(socket, 'no bot in that seat');
      room.seats[seat] = null;
      broadcast(io, room);
    });

    socket.on('bid:order', ({ alone }) => {
      const ctx = getSeatedSession(socket);
      if (!ctx) return err(socket, 'spectators cannot play');
      const { room, seat } = ctx;
      try {
        const { state, events } = applyAction(room.state, {
          type: 'BID_ORDER',
          seat,
          alone: !!alone,
        });
        room.state = state;
        events.forEach((e) => io.to(room.code).emit('room:event', e));
        broadcast(io, room);
      } catch (e) {
        err(socket, (e as Error).message);
      }
    });

    socket.on('bid:pass', () => {
      const ctx = getSeatedSession(socket);
      if (!ctx) return err(socket, 'spectators cannot play');
      const { room, seat } = ctx;
      try {
        const { state, events } = applyAction(room.state, { type: 'BID_PASS', seat });
        room.state = state;
        events.forEach((e) => io.to(room.code).emit('room:event', e));
        broadcast(io, room);
      } catch (e) {
        err(socket, (e as Error).message);
      }
    });

    socket.on('bid:call', ({ suit, alone }) => {
      const ctx = getSeatedSession(socket);
      if (!ctx) return err(socket, 'spectators cannot play');
      const { room, seat } = ctx;
      try {
        const { state, events } = applyAction(room.state, {
          type: 'BID_CALL',
          seat,
          suit,
          alone: !!alone,
        });
        room.state = state;
        events.forEach((e) => io.to(room.code).emit('room:event', e));
        broadcast(io, room);
      } catch (e) {
        err(socket, (e as Error).message);
      }
    });

    socket.on('discard:card', ({ cardId }) => {
      const ctx = getSeatedSession(socket);
      if (!ctx) return err(socket, 'spectators cannot play');
      const { room, seat } = ctx;
      try {
        const { state, events } = applyAction(room.state, {
          type: 'DEALER_DISCARD',
          seat,
          cardId,
        });
        room.state = state;
        events.forEach((e) => io.to(room.code).emit('room:event', e));
        broadcast(io, room);
      } catch (e) {
        err(socket, (e as Error).message);
      }
    });

    socket.on('play:card', ({ cardId }) => {
      const ctx = getSeatedSession(socket);
      if (!ctx) return err(socket, 'spectators cannot play');
      const { room, seat } = ctx;
      try {
        const { state, events } = applyAction(room.state, {
          type: 'PLAY_CARD',
          seat,
          cardId,
        });
        room.state = state;
        events.forEach((e) => io.to(room.code).emit('room:event', e));
        broadcast(io, room);
      } catch (e) {
        err(socket, (e as Error).message);
      }
    });

    socket.on('chat:send', ({ text }) => {
      const ctx = getSessionRoom(socket);
      if (!ctx) return;
      const { room, sess } = ctx;
      const msg = roomManager.postChat(room, socket.id, sess.name, sess.isSpectator, text);
      if (msg) io.to(room.code).emit('chat:msg', msg);
    });

    socket.on('room:leave', () => {
      sessions.delete(socket.id);
      socket.disconnect(true);
    });

    socket.on('disconnect', () => {
      sessions.delete(socket.id);
      roomManager.handleDisconnect(socket.id, (room) => broadcast(io, room));
    });
  });
}
