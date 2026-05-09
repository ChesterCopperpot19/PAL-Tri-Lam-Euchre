// End-to-end smoke test: simulates 4 players + 1 spectator joining a room,
// starting a hand, and verifies redaction (spectator sees no hands).
// Requires the dev server to be running on PORT (default 3000).

import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function mk(name, asSpectator = false) {
  const socket = io(URL, { path: '/api/socket', transports: ['websocket'] });
  const playerId = name + '-' + Math.random().toString(36).slice(2, 8);
  let snapshot = null;
  const events = [];
  socket.on('room:snapshot', (s) => {
    snapshot = s;
  });
  socket.on('room:event', (e) => events.push(e));
  socket.on('room:error', (e) => console.error(`[${name}] error:`, e));
  return {
    socket,
    name,
    playerId,
    asSpectator,
    get snap() {
      return snapshot;
    },
    events,
  };
}

function join(client, code) {
  return new Promise((resolve, reject) => {
    client.socket.emit(
      'room:join',
      { code: code || '', name: client.name, playerId: client.playerId, asSpectator: client.asSpectator },
      (res) => (res.ok ? resolve(res.snapshot) : reject(new Error(res.error)))
    );
  });
}

async function main() {
  const alex = mk('Alex');
  const bea = mk('Bea');
  const cam = mk('Cam');
  const dee = mk('Dee');
  const eve = mk('Eve', true); // spectator

  await wait(50);
  const first = await join(alex, '');
  const code = first.code;
  console.log('Created room', code);
  await join(bea, code);
  await join(cam, code);
  await join(dee, code);
  await join(eve, code);
  await wait(80);

  // Check pre-start lobby state
  if (!alex.snap.full) throw new Error('expected full room');
  if (alex.snap.spectatorCount !== 1) throw new Error('expected 1 spectator');

  // Start the hand
  alex.socket.emit('room:start');
  await wait(80);

  // Snapshots should now reflect BIDDING_1
  const players = [alex, bea, cam, dee];
  for (const p of players) {
    if (p.snap.state.phase !== 'BIDDING_1') throw new Error(`${p.name} expected BIDDING_1`);
    const myHand = p.snap.state.seats[p.snap.state.viewerSeat].hand;
    if (!Array.isArray(myHand) || myHand.length !== 5)
      throw new Error(`${p.name} should see own 5 cards`);
    // Other seats should be hidden
    for (let s = 0; s < 4; s++) {
      if (s === p.snap.state.viewerSeat) continue;
      if (p.snap.state.seats[s].hand !== undefined)
        throw new Error(`${p.name} should NOT see seat ${s} hand`);
    }
  }

  // Spectator: no hands at all, no kitty, no seed
  const spec = eve.snap.state;
  if (!eve.snap.state.spectator) throw new Error('eve should be marked spectator');
  for (let s = 0; s < 4; s++) {
    if (spec.seats[s].hand !== undefined)
      throw new Error(`spectator sees seat ${s} hand!`);
  }
  if (spec.kitty !== undefined) throw new Error('spectator sees kitty!');
  if (spec.seed !== undefined) throw new Error('spectator sees seed!');

  // Spectator cannot play
  let blocked = false;
  eve.socket.once('room:error', () => (blocked = true));
  eve.socket.emit('play:card', { cardId: 'AH' });
  await wait(60);
  if (!blocked) throw new Error('spectator play should have been rejected');

  // Spectator cannot bid
  blocked = false;
  eve.socket.once('room:error', () => (blocked = true));
  eve.socket.emit('bid:order', { alone: false });
  await wait(60);
  if (!blocked) throw new Error('spectator bid should have been rejected');

  // Player attempts to play out of turn
  // Find current turn seat
  const turn = alex.snap.state.turn;
  const offTurn = players.find((p) => p.snap.state.viewerSeat !== turn);
  blocked = false;
  offTurn.socket.once('room:error', () => (blocked = true));
  offTurn.socket.emit('bid:order', { alone: false });
  await wait(60);
  if (!blocked) throw new Error('off-turn bid should have been rejected');

  // Take the hand to PLAYING by ordering it up
  const turnSeat = alex.snap.state.turn;
  const turnPlayer = players[turnSeat];
  turnPlayer.socket.emit('bid:order', { alone: false });
  await wait(80);

  // Now phase should be DEALER_DISCARD; dealer is seat 0 (alex)
  if (alex.snap.state.phase !== 'DEALER_DISCARD')
    throw new Error('expected DEALER_DISCARD, got ' + alex.snap.state.phase);
  // Dealer discards a card (any from their hand)
  const dealerHand = alex.snap.state.seats[0].hand;
  alex.socket.emit('discard:card', { cardId: dealerHand[0].id });
  await wait(80);

  if (alex.snap.state.phase !== 'PLAYING')
    throw new Error('expected PLAYING, got ' + alex.snap.state.phase);

  // Play one card from the leader to confirm trick area + legalPlayIds work
  const leaderSeat = alex.snap.state.turn;
  const leader = players[leaderSeat];
  const legalIds = leader.snap.state.legalPlayIds;
  if (!legalIds.length) throw new Error('leader should have legal plays');
  leader.socket.emit('play:card', { cardId: legalIds[0] });
  await wait(60);

  if (alex.snap.state.currentTrick.plays.length !== 1)
    throw new Error('expected 1 play after leader');

  // Cleanup
  for (const p of [alex, bea, cam, dee, eve]) p.socket.disconnect();
  console.log('SMOKE TEST: all checks passed ✓');
  process.exit(0);
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e.message);
  process.exit(1);
});
