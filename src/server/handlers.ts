import type { Server, Socket } from 'socket.io';
import { applyAction, createGame } from './engine/game';
import { chooseBotAction } from './engine/bot';
import { redactState } from './engine/redact';
import { roomManager, Room } from './rooms';
import {
  ClientToServerEvents,
  MatchRecord,
  PlayerAllTime,
  PlayerMatchStat,
  RoomListEntry,
  RoomSnapshot,
  ServerToClientEvents,
} from '@/lib/shared-types';
import { TEAM_OF, type SeatIndex } from './engine/types';
import { getMatches, recordMatch } from './stats-store';

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

const SEAT_FALLBACK = ['South', 'West', 'North', 'East'] as const;

/** Build a MatchRecord from a finished room's per-hand history. */
function buildMatchRecord(room: Room): MatchRecord {
  const history = room.state.history;
  const players: PlayerMatchStat[] = ([0, 1, 2, 3] as SeatIndex[]).map((seat) => {
    const seatData = room.seats[seat];
    const team = TEAM_OF[seat];
    let tricks = 0;
    let defensiveTricks = 0;
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
      } else {
        defensiveTricks += t;
      }
    }
    return {
      name: seatData?.name ?? SEAT_FALLBACK[seat],
      seat,
      team,
      isBot: seatData?.isBot ?? false,
      tricks,
      defensiveTricks,
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
  };
}

/** Aggregate all-time stats across matches — humans only, sorted by wins. */
function aggregatePlayers(matches: MatchRecord[]): PlayerAllTime[] {
  const map = new Map<string, PlayerAllTime>();
  for (const m of matches) {
    for (const p of m.players) {
      if (p.isBot) continue; // all-time leaderboard is humans only
      const key = p.name.trim();
      if (!key) continue;
      let agg = map.get(key);
      if (!agg) {
        agg = {
          name: key,
          games: 0,
          wins: 0,
          tricks: 0,
          defensiveTricks: 0,
          handsCalled: 0,
          callsWon: 0,
          euchres: 0,
          marches: 0,
          loneCalled: 0,
          loneWon: 0,
        };
        map.set(key, agg);
      }
      agg.games++;
      if (p.team === m.winnerTeam) agg.wins++;
      agg.tricks += p.tricks;
      agg.defensiveTricks += p.defensiveTricks;
      agg.handsCalled += p.handsCalled;
      agg.callsWon += p.callsWon;
      agg.euchres += p.euchres;
      agg.marches += p.marches;
      agg.loneCalled += p.loneCalled;
      agg.loneWon += p.loneWon;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.wins - a.wins || b.games - a.games || b.tricks - a.tricks
  );
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
  const prevCount = room.lastTrickCount;
  const currCount = room.state.completedTricks.length;
  room.lastTrickCount = currCount;
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

// If it's an absent or idle human's turn, the server plays a sensible move for
// them after a delay so the game never freezes. Disconnected players get a short
// window (in case they reconnect); connected-but-idle players get longer.
const AFK_TURN_MS = 30_000;
const DISCONNECTED_TURN_MS = 10_000;

const ACTIONABLE_PHASES = new Set(['BIDDING_1', 'BIDDING_2', 'DEALER_DISCARD', 'PLAYING']);

function scheduleHumanTurnTimer(io: IO, room: Room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  if (!ACTIONABLE_PHASES.has(room.state.phase)) return;
  const turnSeat = room.state.turn;
  const seated = room.seats[turnSeat];
  if (!seated || seated.isBot) return; // bots are handled by scheduleBotTick
  if (room.state.sittingOut.includes(turnSeat)) return;

  const delay = seated.socketId ? AFK_TURN_MS : DISCONNECTED_TURN_MS;
  room.turnTimer = setTimeout(() => {
    room.turnTimer = null;
    if (!roomManager.get(room.code)) return; // room gone
    // Re-validate: still the same human's turn in an actionable phase. (Any state
    // change reschedules this timer, so normally nothing has changed.)
    if (!ACTIONABLE_PHASES.has(room.state.phase) || room.state.turn !== turnSeat) return;
    const s = room.seats[turnSeat];
    if (!s || s.isBot) return;
    try {
      const action = chooseBotAction(room.state, turnSeat);
      const { state, events } = applyAction(room.state, action);
      room.state = state;
      events.forEach((e) => io.to(room.code).emit('room:event', e));
      broadcast(io, room);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`auto-play (absent human) failed in room ${room.code}:`, (e as Error).message);
    }
  }, delay);
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
    socket.on('rooms:list', (ack) => {
      try {
        ack(listRooms());
      } catch (e) {
        ack([]);
      }
    });

    socket.on('stats:get', async (ack) => {
      try {
        const all = await getMatches();
        const recent = all.slice().reverse(); // most recent first
        ack({
          matches: recent.slice(0, 50),
          players: aggregatePlayers(all),
          totalMatches: all.length,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('stats:get failed:', (e as Error).message);
        ack({ matches: [], players: [], totalMatches: 0 });
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

    socket.on('room:rematch', () => {
      // Reset a finished game back to the lobby, keeping every seat (players +
      // bots) so the same group can play again. The lobby lets people confirm
      // seats / swap bots before the host starts the next game.
      const ctx = getSeatedSession(socket);
      if (!ctx) return err(socket, 'only players can rematch');
      const { room } = ctx;
      if (room.state.phase !== 'GAME_OVER') return err(socket, 'game is not over');
      if (room.botTimer) {
        clearTimeout(room.botTimer);
        room.botTimer = null;
      }
      if (room.handEndTimer) {
        clearTimeout(room.handEndTimer);
        room.handEndTimer = null;
      }
      if (room.turnTimer) {
        clearTimeout(room.turnTimer);
        room.turnTimer = null;
      }
      room.state = createGame();
      room.statsRecorded = false;
      room.lastTrickCount = 0;
      io.to(room.code).emit('room:event', 'rematch');
      broadcast(io, room);
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
      // Intentional leave: remove the player immediately (no reconnect grace).
      const ctx = getSessionRoom(socket);
      if (ctx) {
        const { room, sess } = ctx;
        const seat = roomManager.findSeat(room, sess.playerId);
        if (seat != null) room.seats[seat] = null;
        room.spectators = room.spectators.filter((sp) => sp.playerId !== sess.playerId);
        // Hand off host to a remaining human if needed.
        if (room.hostPlayerId === sess.playerId) {
          room.hostPlayerId =
            room.seats.find((s) => s && !s.isBot)?.playerId ??
            room.spectators[0]?.playerId ??
            '';
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
      roomManager.handleDisconnect(socket.id, (room) => broadcast(io, room));
    });
  });
}
