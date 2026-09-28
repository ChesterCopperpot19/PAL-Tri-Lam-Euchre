# Euchre roadmap: hand analyzer, stronger bot, phone table, deploy-safe games

Written 2026-09-27 for a fresh Claude Code session opened in `/Users/bryanrohm/Documents/Euchre`.
Kickoff message: **"Read docs/plans/hand-analyzer-roadmap.md and start Phase 0."**

## Status (2026-09-28)

| Phase | State | PRs |
| --- | --- | --- |
| 0. Setup and CI | Done | #2 |
| 1. Phone table | Done, live | #3 |
| 2. Hand analyzer | Done, live | #4 |
| 3. Strong bot and fair grading | Done, live. Beats the old bot by +0.14 points/hand on 2,000 duplicate deals; ~60 sampled deals per decision on Render (`/api/bot-stats`). | #5, #6 |
| 3b. Decision-quality stats | Done, live: profile Decisions tab and a dashboard ranking, approved by the user once fair grading existed. | #7 |
| 4. Durable rooms | Merged; live mid-game deploy test under way | #8 |
| 5. Maintenance | Not started | |

## Ground rules

1. **Merging to `main` deploys the live site.** Render auto-deploys `main` in about two minutes. Never merge without the user's explicit go-ahead for that specific PR.
2. **The user wants to see the hand analyzer as a local prototype before it deploys.** Phase 2 ends at a demo gate. Stop there and wait for approval.
3. **The local `.env` points at the PRODUCTION database.** The `euchre-dev` launch config writes a real match into the club's permanent stats whenever a test game reaches game over. Use `euchre-offline` for all development (details below).
4. **Don't finish test games on the live site.** Leaving before game over is safe: an all-bot room is deleted and nothing is recorded.
5. **The GitHub repo is public.** Never commit `data/` (gitignored, holds real member names). Don't put player names next to misplays in commits, docs, or PR text.
6. **No per-player "decision quality" rankings until Phase 3's fair grading exists and the user approves.** Hindsight grading punishes reasonable plays, and these are friends.
7. **Brand:** Pitt Athletics colors and type as homage only, no trademarked Pitt marks. Royal `#003594` owns the field, Gold is for calls to action.

One branch and one PR per phase, based on `origin/main`.

## Why this plan exists

A review on 2026-09-27 built a working double-dummy solver against the club's real games. Double-dummy means playing a hand out perfectly with every card face up. It runs on the game's own rules module and passed every integrity check:

| Measure | Result |
| --- | --- |
| Engine vs recorded trick winners | 730 of 730 agree |
| Hands whose grading reconciles exactly to the final score | 146 of 146 |
| Plays that gave away a trick, with hindsight | 122, about 1 in 23 |
| Hands where a misplay flipped who scored | 12 |
| Marches available but missed | 18 |
| Time to grade every play in a hand, on this Mac | about 175 ms |

The review also found the phone table bug and the deploy-kills-games problem below. The user approved all five phases.

## Project facts

- **Repo:** GitHub `ChesterCopperpot19/PAL-Tri-Lam-Euchre`, public. The `origin` and `render` remotes both point at it.
- **Live:** https://pal-tri-lam-euchre.onrender.com on Render's free tier. It sleeps after 15 idle minutes and takes up to a minute to wake. The instance has very little CPU, so keep heavy computation in the browser.
- **Verifying a deploy:** Render can report "live" while still serving the old build. Don't rely on the `webpack-<hash>.js` runtime the live HTML references: the Phase 1 deploy changed CSS and components and that hash stayed the same. Instead, grep the served CSS (the `/_next/static/css/*.css` the HTML links) or a page chunk for a string unique to the new code, such as a new class name. A server-only change won't show up there, so verify those by exercising the changed behavior. If the old build is still serving, do a clear-cache redeploy from the Render dashboard.
- **Stack:** Next.js 14.2 app router, a custom `server.ts` hosting Socket.io 4.8 on the same port, Postgres on Neon, Tailwind, Vitest.
- **Server:** everything authoritative lives in `src/server/`. `engine/` is a pure, tested game engine; `rules.ts` there exports `legalPlays`, `trickWinner`, and `effectiveSuit` with no Node dependencies, so it is safe to import in the browser. `handlers.ts` holds the socket events, validated and wrapped. `rooms.ts` keeps rooms in memory. `stats-store.ts` is Postgres with a local-file fallback.
- **Env vars:** `DATABASE_URL`, `STATS_ADMIN_KEY` (gates manual game logging and deletion, fails closed), `ALLOWED_ORIGINS` (falls back to `RENDER_EXTERNAL_URL`, or localhost:3000 in dev), `PGSSL_INSECURE`.
- **Data:** 139 games. 123 are historical imports with no card data, and nobody has used the manual logging form. 16 were played in the app, and 14 of those store every card of every hand: 146 hands.
- **Hand record:** `HandSummary` in `src/server/engine/types.ts` holds trump, maker, alone, dealer, upcard, orderedUp, bidRound, bids, and all five tricks with every play and winner. Each seat's hand is reconstructed from the cards it played. Deliberately not stored: the dealer's discard, the kitty, and the cards of a loner's sitting-out partner.
- **Stats data flow:** the `stats:get` socket event sends every game with hands slimmed to summaries. `stats:hands` sends the card-level detail on demand. The client hook for the latter is `src/components/stats/useFullHands.ts`.

## Tools already in place

These are untracked right now. Commit them in Phase 0.

- `scripts/fetch-club-snapshot.ts` pulls the public stats from the live site into `data/`, including `data/matches.json` in the file-store format. Run `npx tsx scripts/fetch-club-snapshot.ts`. It is read-only against production.
- `scripts/prototype/solver-report.ts` is the working solver, with integrity checks and a report. It also writes `data/dd-baseline.json`, per-hand results the production solver must reproduce. Run `npx tsx scripts/prototype/solver-report.ts`.
- `scripts/socket-fuzz-check.ts` fires malformed packets at every socket event. Exit 0 means nothing crashed.
- Launch configs in `.claude/launch.json`, which is gitignored:
  - `euchre-dev` runs `npm run dev` against the **production database**.
  - `euchre-offline` runs with `DATABASE_URL` blanked, so the server uses `data/matches.json`. This was verified: the storage layer served all 139 games from the snapshot. Refresh the snapshot first if it's stale.
- `scripts/check-bot-names.mjs` predates this plan and belongs to the user. Leave it alone.

## Phase 0: Setup and CI

1. Create the branch with `git switch -c phase0-setup origin/main`. Local `main` holds an unrelated, stale three-commit history, so don't build on it.
2. Commit this plan and the two new scripts.
3. Add a GitHub Actions workflow that runs on every pull request: `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, and `npx tsx scripts/socket-fuzz-check.ts`. None of these need secrets or a database.
4. Ask the user two things:
   - Is `STATS_ADMIN_KEY` set on Render? Manual logging returns "not authorized" until it is.
   - May you clean up the repo? That means resetting local `main` to `origin/main`, removing the duplicate `render` remote and the `render-main` branch, and deleting the merged `security-review-hardening` branch. Nothing unique is lost, but ask first.

**Done when:** CI runs green on the Phase 0 PR and the user approves the merge.

## Phase 1: Fix the table on phones

**Diagnosis:** In `src/components/Table.tsx`, the middle row is one centered flex row holding the left seat, the fixed-size felt, and the right seat. At 375px that row is wider than the screen, so both sides overflow and get clipped. The left name plate starts at x = −22 and reads "ggie". The right plate wraps and is cut off. Neither side player's card count shows.

**Approach:** Below the `sm` breakpoint, either tuck the side seats against the felt's edges with absolute positioning, or size the felt with `clamp()` so the row fits. Each side seat must show its full name, truncated with an ellipsis if needed and with the full name in `aria-label`, plus its card count and the dealer and maker badges.

**Verify** at widths 360, 375, 390, 430, and desktop. Check bidding, the dealer discard, trick play, the trick animation, a loner hand with a sitting-out partner, and game over. Confirm there's no horizontal scroll, and send the user screenshots.

**Done when:** the user approves, then merge, then check the deploy by build ID.

## Phase 2: Hand analyzer prototype, ending in a demo gate

**What it does:** It lets members relive any app-played hand and see where it was won or lost.

**Screens:**
- **Game detail page** at `/stats/games/[id]`, linked from the archive rows. It lists each hand with the dealer, trump, maker, and result. A "decided by a misplay" badge marks hands where the grading shows the outcome flipped.
- **Hand replay:**
  - Show all four hands face up, the upcard, the dealer, and the bidding sequence.
  - Step through trick by trick with buttons and the arrow keys.
  - Give each play a verdict: "best play", or "gave away N trick(s), X was better".
  - Add a swing chart plotting the tricks the makers can still force across all the plays, with misplays marked. Read the `dataviz` skill before building it.
  - Label every verdict "with every card visible".
- **Session recap:** add the night's costliest play and best play.
- Historical games have no card data. Show their summary with a plain explanation instead of a broken replay.

**Engine:**
- Port `gradeHand` from the prototype into a pure module, `src/lib/solver/`, that imports the existing rules module.
- Unit-test it on hand-built positions: the last trick, a forced follow, the left bower counting as trump, and a three-seat loner hand.
- Add a property test in CI. Deal seeded random hands with the engine's own dealer, play them out with the current bot, and assert every hand reconciles. That covers the solver with no real data.
- Locally, confirm it reproduces `data/dd-baseline.json` exactly.

**Performance:**
- Solve in the browser inside a Web Worker, only for the hand or game being viewed, and cache the results. Keep this work off the server.
- Target verdicts within a second of opening a hand. If a hand takes over 300 ms in the browser, add alpha-beta pruning and move ordering.
- The content security policy allows same-origin worker scripts but not `blob:` workers. Check the console for CSP errors.

**Not in this phase:** per-player decision rankings (see ground rule 6).

**DEMO GATE:**
1. Start `euchre-offline` after refreshing the snapshot.
2. Open these hands, where a misplay changed who scored:
   - Game `1782267946795-ASGY`, hand 12. Both sides misplayed: trick 1 by a defender, and trick 3 by the maker.
   - Game `1782744517636-8PM3`, hand 12. A defender's trick-1 play cost 2 tricks.
   - Game `1782270282253-ASGY`, hand 5.
   - Game `1784082854685-T6L8`, hand 2. Both sides misplayed on trick 1.
3. Screenshot desktop and phone widths and show the user.
4. **Stop and wait.** Iterate on feedback. Open the PR only after the user explicitly approves the prototype.

## Phase 3: Fair grading and a much stronger bot

Both run on one engine.

**Information-set sampling:** at any decision point, a seat knows:
- its own hand, the upcard, and the dealer
- whether the dealer picked the upcard up, and that the dealer still holds it until it's played
- the bids and every card played so far
- the voids each player has revealed by failing to follow suit, treating the left bower as trump

Deal the unseen cards many times in ways consistent with all of that, solve each deal with the Phase 2 solver, and average the result per candidate move.

**Analyzer:** add a second verdict, "with what you could see", next to the hindsight one. That fair grade is the only acceptable basis for per-player decision stats on profile pages, and those need the user's approval.

**Bot:**
- Choose bids (order, pass, call, go alone) by expected points across the sampled deals: +1 to make, +2 to march, +4 for a lone march, 2 to the opponents on a euchre.
- Choose the dealer discard and every card play the same way.
- Run it in a `worker_threads` pool on the server with a time budget of about 300 ms, so the Socket.io loop never blocks. The current heuristic bot remains the fallback on timeout or error.

**Proof before shipping:**
- Add `scripts/bot-tournament.ts`. Play the new bot against the old one on at least 2,000 duplicate-dealt hands: the same deals with seats swapped, so card luck cancels out. Report points per hand with a confidence interval.
- Ship only if the new bot is clearly better.
- Also measure decision time on the Render instance, which is far slower than a laptop, and tune the sample count to fit. Consider an Easy/Strong choice in the lobby.

**Done when:** the user approves.

## Phase 4: Games survive deploys and restarts

**Problem:** rooms live only in server memory, so every deploy and every Render restart kills games in progress.

**Approach:**
- Add a `rooms` table with `code` as primary key, `state` as JSONB, and `updated_at`, plus the same file fallback for offline mode.
- Save after each broadcast, debounced, and flush on SIGTERM, which Render sends before stopping.
- On boot, restore rooms updated in the last six hours.
- Restore seats as disconnected, with a longer post-restart grace, so the auto-play for absent players doesn't fire before people reconnect.
- Persist the seat reclaim tokens to the database only. Never put them in snapshots.
- Re-arm timers through the normal broadcast path.

**Verify:** in offline mode, start a four-tab game, stop the server mid-hand, and restart it. Every tab should reconnect to its own seat with its own hand, and the bots should resume. Then do one real deploy mid-game, with the user watching if they want.

**Done when:** the user approves.

## Phase 5: Maintenance

- **Audit warning:** the one remaining `npm audit` item is the PostCSS bundled inside Next 14. Try an npm `overrides` entry pinning Next's nested PostCSS first. Only if that fails, propose a Next 15 upgrade, which requires React 19 and has async `params` changes, as its own decision for the user.
- **Split large components:** break `Table.tsx` (575 lines) into `useTrickAnimation`, `useSoundPreference`, and `TableHeader`. Pull a `useStatsData` hook out of `src/app/stats/page.tsx` (687 lines).
- **Housekeeping:** do whatever cleanup the user approved in Phase 0.
