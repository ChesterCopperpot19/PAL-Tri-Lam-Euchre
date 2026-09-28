import { describe, it, expect } from 'vitest';
import { RoomManager } from '../src/server/rooms';
import { serializeRoom } from '../src/server/room-store';
import { applyAction } from '../src/server/engine/game';
import { chooseBotAction } from '../src/server/engine/bot';

function liveRoom() {
  const rm = new RoomManager();
  const room = rm.create('p0');
  room.seats = [
    { playerId: 'p0', name: 'Ann', token: 'tok-ann', socketId: 'sock-a', disconnectedAt: null, isBot: false },
    { playerId: 'b1', name: 'Maggie', token: '', socketId: null, disconnectedAt: null, isBot: true },
    { playerId: 'p2', name: 'Bea', token: 'tok-bea', socketId: 'sock-b', disconnectedAt: null, isBot: false },
    { playerId: 'b3', name: 'Jen Scalia', token: '', socketId: null, disconnectedAt: null, isBot: true },
  ];
  room.spectators = [{ playerId: 's', name: 'Sid', token: 'tok-sid', socketId: 'sock-s' }];
  room.botLevel = 'easy';
  // Play into the middle of a hand.
  let s = applyAction({ ...room.state, seed: 42 }, { type: 'START_HAND' }).state;
  for (let i = 0; i < 12; i++) s = applyAction(s, chooseBotAction(s, s.turn)).state;
  room.state = s;
  room.statsRecorded = false;
  room.startedTs = 123;
  return room;
}

describe('durable rooms', () => {
  it('saves the game and seat tokens but never sockets or spectators', () => {
    const saved = serializeRoom(liveRoom());
    const json = JSON.stringify(saved);
    expect(json).not.toContain('sock-');
    expect(json).not.toContain('tok-sid');
    expect(saved.seats[0]).toEqual({ playerId: 'p0', name: 'Ann', token: 'tok-ann', isBot: false });
    expect(saved.botLevel).toBe('easy');
  });

  it('restores the same game with every human seat disconnected, ready to reclaim', () => {
    const before = liveRoom();
    const saved = JSON.parse(JSON.stringify(serializeRoom(before))); // as it comes back from storage
    const rm = new RoomManager();
    const room = rm.restore(saved)!;
    expect(room).not.toBeNull();
    expect(rm.get(before.code)).toBe(room);
    expect(room.state).toEqual(before.state); // hands, trick, turn, seed, discard...
    expect(room.seats[0]).toMatchObject({ playerId: 'p0', token: 'tok-ann', socketId: null, isBot: false });
    expect(room.seats[0]!.disconnectedAt).not.toBeNull();
    expect(room.seats[1]).toMatchObject({ isBot: true, disconnectedAt: null });
    expect(room.spectators).toEqual([]);
    expect(room.restoredAt).toBeGreaterThan(0);
    expect(room.startedTs).toBe(123);
    expect(room.botTimer).toBeNull();
    // A second restore of the same code is refused (already live).
    expect(rm.restore(saved)).toBeNull();
  });
});
