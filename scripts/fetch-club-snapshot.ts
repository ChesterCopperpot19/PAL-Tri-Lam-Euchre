// Pulls the club's stats from the live site (the same data the public /stats page
// loads) into data/, which is gitignored. Writes three files:
//   data/club-meta.json   stats:get payload (every game, hands slimmed to summaries)
//   data/club-hands.json  stats:hands payload (card-by-card hands for app-played games)
//   data/matches.json     full match records in the offline file-store format, so the
//                         dev server can run against real history with no database
//
// Run: npx tsx scripts/fetch-club-snapshot.ts
// Read-only: it only calls the two public read events.

import fs from 'fs';
import path from 'path';
import { io } from 'socket.io-client';
import type { MatchRecord } from '../src/lib/shared-types';

const SITE = process.env.EUCHRE_URL ?? 'https://pal-tri-lam-euchre.onrender.com';
const OUT = path.join(process.cwd(), 'data');

// Polling first: a websocket-only connection from Node timed out against Render in
// testing, while polling (what browsers fall back to) connects reliably.
const socket = io(SITE, { path: '/api/socket', transports: ['polling', 'websocket'] });
const call = <T>(event: 'stats:get' | 'stats:hands') =>
  new Promise<T>((resolve) => (socket.emit as any)(event, resolve));

// Render's free tier sleeps when idle and can take about a minute to wake.
const deadline = setTimeout(() => {
  console.error(`No response from ${SITE} within 120s.`);
  process.exit(1);
}, 120_000);

socket.on('connect_error', (e) => console.error('connect_error:', e.message));
socket.on('connect', async () => {
  const meta = await call<{ matches: MatchRecord[]; totalMatches: number }>('stats:get');
  const full = await call<{ games: Array<{ id: string; hands: MatchRecord['hands'] }> }>('stats:hands');

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'club-meta.json'), JSON.stringify(meta));
  fs.writeFileSync(path.join(OUT, 'club-hands.json'), JSON.stringify(full));

  // stats:get sends newest first with bids/tricks stripped; put the full hands back and
  // store oldest first, which is the order the file store appends in.
  const fullHands = new Map(full.games.map((g) => [g.id, g.hands]));
  const matches = meta.matches
    .map((m) => (fullHands.has(m.id) ? { ...m, hands: fullHands.get(m.id) } : m))
    .sort((a, b) => a.ts - b.ts);
  fs.writeFileSync(path.join(OUT, 'matches.json'), JSON.stringify(matches));

  const hands = full.games.reduce((n, g) => n + (g.hands?.length ?? 0), 0);
  console.log(`Saved ${matches.length} games (${full.games.length} with card-level data, ${hands} hands) to data/`);
  clearTimeout(deadline);
  socket.close();
});
