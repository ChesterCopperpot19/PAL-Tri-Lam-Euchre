# PAL/Tri-Lam Euchre Club

Real-time multiplayer **Euchre** for the browser — Next.js 14 + TypeScript + Tailwind + Socket.io, with all rules enforced server-side. Built for the club; bring your own friends.

> 🃏 **Custom card backs**: drop five photos (`1.jpg` through `5.jpg`) into [`public/card-backs/`](./public/card-backs/) and they'll automatically become the deck design. See that folder's README for sizing notes.

> 📜 **Rules cross-check**: see [RULES.md](./RULES.md) for a row-by-row comparison of every implemented rule vs. canonical Euchre (Hoyle's, Bicycle, Pagat) and the house-rule choices we picked.

- 🃏 24-card deck, fixed N/S vs E/W partnerships
- 🎯 Two-round bidding, *stick the dealer*, left bower as second-highest trump
- 🔁 Going alone (lone march = 4)
- 👁 **Spectator mode** — watch but see no one's hand (cheat-proof)
- 💬 Built-in table chat
- 📱 Responsive, click-to-play, legal-move highlighting
- 🔌 Reconnects mid-hand without losing your seat

---

## Quick start (local)

```bash
cd ~/Documents/Euchre
npm install
npm run dev          # http://localhost:3000
```

Open four browser windows (one per friend, or four incognito tabs to test alone). Create a room in the first, then everyone else joins with the room code or the `?code=XXXX` URL.

Run the engine tests:

```bash
npm test
```

Production build sanity check:

```bash
npm run build
npm start
```

---

## How a game flows

1. **Lobby** — first player creates a room and shares the 4-letter code. Up to 4 players + unlimited spectators. Host clicks **Start** when 4 are seated.
2. **Bidding round 1** — going clockwise from dealer's left, each player can *Order it up* (trump = upcard suit) or *Pass*. If ordered, the dealer takes up the upcard and discards one.
3. **Bidding round 2** — if all passed, each player can call any other suit. The dealer **must** call (stick-the-dealer).
4. **Play** — five tricks; you must follow the led suit if you can (the left bower follows trump). Highest trump (or highest of led suit) wins each trick. After each trick, winner leads the next.
5. **Score** — 1 for 3–4 tricks, 2 for a march, 4 for a lone march. Defenders get 2 if makers are euchred.
6. First to **10 points** wins.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (Next.js client)                           │
│  - landing / room pages, Tailwind UI                │
│  - socket.io-client (long-lived ws)                 │
└──────────────────────┬──────────────────────────────┘
                       │ websocket (same origin)
┌──────────────────────┴──────────────────────────────┐
│  Custom Node server (server.ts)                     │
│  - Next.js for SSR + static                         │
│  - Socket.io on /api/socket                         │
│  - RoomManager (in-memory)                          │
│  - Pure engine in src/server/engine/ (testable)     │
└─────────────────────────────────────────────────────┘
```

**Server-authoritative**: all rule validation happens on the server. Clients send *intents* (`bid:order`, `play:card`); the server applies the action through `applyAction(state, action)` and emits a per-recipient redacted snapshot.

**Spectator cheat-proofing**: `redactState(state, null)` strips every seat's `hand` field, plus `kitty` and `seed` are never sent to anyone. Even if a spectator is screen-sharing with a player, they have no extra information to leak.

---

## Project layout

```
src/
├── app/            # Next.js App Router pages
├── components/     # React UI (Card, Hand, Table, Chat, …)
├── lib/            # Client utilities + shared types
└── server/
    ├── engine/     # Pure, testable game engine
    ├── rooms.ts    # RoomManager (rooms, seats, spectators)
    └── handlers.ts # Socket.io event wiring
server.ts           # Custom Next + Socket.io entrypoint
__tests__/          # Vitest engine tests
```

---

## Deploy (single service — Render / Railway / Fly.io)

The app is one Node process, so the simplest path is a single web service.

### Render (recommended for free tier)

1. Push this repo to GitHub.
2. **New → Web Service** on [render.com](https://render.com), connect the repo.
3. **Build command**: `npm install && npm run build`
4. **Start command**: `npm start`
5. Health check path: `/`
6. Share the Render URL with friends. Done.

### Railway

1. New project → Deploy from GitHub.
2. Add a service with **Start command**: `npm start`. Railway auto-detects Node + injects `PORT`.
3. Build command (under settings): `npm install && npm run build`.

### Fly.io

```bash
fly launch        # accept Node defaults
# edit fly.toml: internal_port = 3000
fly deploy
```

### Why not Vercel?

Vercel's serverless functions terminate after a few seconds — Socket.io needs a long-lived WebSocket. You *can* split (Next.js on Vercel + Socket.io on Render), but that's two deploys and CORS work for no real win. Single Node host is faster and simpler.

---

## Verifying it works

A 5-step sanity check after deploy:

1. **Tests pass** — `npm test`.
2. **4-player game** — open 4 windows, play one full hand, confirm scoring.
3. **Reconnect** — hard-refresh one tab mid-hand; the seat is held and your hand returns intact (60s grace window).
4. **Mobile** — Chrome DevTools → iPhone 13 viewport. Cards are tappable; chat collapses below the table.
5. **Cheat resistance** — open a 5th tab as spectator. In its devtools, inspect `socket.on('room:snapshot', …)` payloads — every seat's `hand` field should be absent. Try emitting `socket.emit('play:card', { cardId: 'AH' })` from the spectator console — server replies with `room:error`.

---

## Out of scope (for now)

- Persistence across server restarts (rooms are in-memory; restarting kicks everyone, fine for a casual session).
- Bots / AI fill-in.
- Persistent accounts / matchmaking.

PRs welcome — start with `__tests__/engine.test.ts` to keep behavior pinned.
