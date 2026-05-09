# Rules — what's implemented (and how it compares to canonical Euchre)

Cross-checked against Hoyle's, the Bicycle "Official Rules of Card Games", and the rule sets used by Trickster Cards, Hardwood Euchre, World of Card Games, and Pagat.com.

| # | Rule | Implementation | Status |
|---|---|---|---|
| 1 | **Deck**: 24 cards (9, 10, J, Q, K, A in four suits) | `buildDeck()` in [deck.ts](src/server/engine/deck.ts) | ✅ Standard |
| 2 | **Players**: 4, fixed partnerships across the table (N/S vs E/W) | Seats 0+2 = N/S, 1+3 = E/W in [types.ts](src/server/engine/types.ts) | ✅ Standard |
| 3 | **Deal**: 5 cards each, 4-card kitty, top card flipped face-up as the upcard | `dealHand()` in [game.ts](src/server/engine/game.ts) | ✅ Standard (some traditions deal in 3-2-3-2 batches; outcome identical with a shuffled deck) |
| 4 | **Bidding round 1**: clockwise from dealer's left, each player may "order it up" or pass. If ordered, dealer takes the upcard and discards | `BID_ORDER` in [game.ts](src/server/engine/game.ts) | ✅ Standard |
| 5 | **Bidding round 2**: if all pass round 1, clockwise again, each may call any suit OTHER than the upcard's suit | `BID_CALL` rejects upcard suit | ✅ Standard |
| 6 | **Stick the dealer**: dealer cannot pass in round 2 | `BID_PASS` rejects pass for dealer in BIDDING_2 | ⚠️ House rule (very common — used by Trickster, Hardwood, most online sites). Original Hoyle's allows pass and re-deals; we use stick because most groups do |
| 7 | **Right bower**: J of trump suit, highest trump | `isRightBower()` in [rules.ts](src/server/engine/rules.ts), strength 1000 | ✅ Standard |
| 8 | **Left bower**: J of same color as trump, second-highest trump. Treated as part of trump suit for follow-suit and trick-winning | `isLeftBower()`, `effectiveSuit()` | ✅ Standard |
| 9 | **Trump rank order**: Right bower > Left bower > A > K > Q > 10 > 9 (of trump) | `cardStrength()` | ✅ Standard |
| 10 | **Going alone**: maker may declare alone; partner sits out for the hand | `alone` flag, `sittingOut[]` | ✅ Standard. Allowed in both round 1 (with order-up) and round 2 (with call) |
| 11 | **Lone hand wins all 5**: 4 points | `pointsAwarded[makers] = 4` when `march && alone` | ✅ Standard |
| 12 | **Lone hand wins 3 or 4**: 1 point (no bonus over a regular partial win) | `pointsAwarded[makers] = 1` | ✅ Standard |
| 13 | **Standard march** (5 tricks, not alone): 2 points | `pointsAwarded[makers] = 2` when `march && !alone` | ✅ Standard |
| 14 | **Standard win** (3 or 4 tricks): 1 point | | ✅ Standard |
| 15 | **Euchre** (makers fail to take 3): defenders score 2 points | `pointsAwarded[defenders] = 2` | ✅ Standard. Some house rules give 4 points for euchring a lone caller — we use the canonical 2 |
| 16 | **First to 10 points wins** | `POINTS_TO_WIN = 10` in [types.ts](src/server/engine/types.ts) | ✅ Standard. Some online variants play to 7; 10 is the most traditional |
| 17 | **Trick play**: first trick led by player to dealer's left; subsequent tricks led by previous trick's winner | `turn = next(dealer)` after bidding; `turn = winner` after each trick | ✅ Standard |
| 18 | **Going-alone lead order**: skip alone-maker's partner in rotation | `advanceTurn()` skips `sittingOut[]` | ✅ Standard |
| 19 | **Must follow suit (if able)**, using effective suit (left bower counts as trump). Otherwise any card | `legalPlays()` | ✅ Standard |
| 20 | **Trick winner**: highest trump, or highest of led effective suit if no trump played | `trickWinner()` | ✅ Standard |
| 21 | **Dealer rotation**: clockwise after each hand | `startNextHand()` rotates `dealer = next(dealer)` | ✅ Standard |
| 22 | **Dealer's discard is hidden** from opponents | Per-player redaction; the discarded card is removed from state and not exposed | ✅ Standard |
| 23 | **In round 2, no one (including dealer) may call the upcard's suit** | `BID_CALL` rejects `suit === upcard.suit` | ✅ Standard |

## House-rule choices

- **Stick the dealer** is on. (Common in casual Euchre, prevents dead hands.)
- **Game to 10 points**, not 7.
- **Euchring a lone caller** awards the standard 2 points to defenders, not the variant 4.

## What's intentionally NOT implemented

- **Defending alone** — a non-maker may, in some rule sets, declare "alone" themselves, sitting out their own partner. Not implemented. (Adds 4 points if defenders alone-euchre, but rarely used in casual play.)
- **Bidding the back** / "no trump" / "British Euchre" extensions.
- **Farmer's hand** redeal (some variants allow a redeal if your hand is all 9s and 10s).
- **Throw-down hand on round 2 all-pass** — moot, since stick the dealer is on.

If you want any of these toggled on/off, they live in [game.ts](src/server/engine/game.ts) (`scoreHand`, `BID_PASS` for stick) and are short to add behind a `houseRules` flag.

## Verifying behavior

The unit-test file [`__tests__/engine.test.ts`](__tests__/engine.test.ts) pins the most error-prone rules:

- Left bower's effective suit (`rules: bowers + effective suit`)
- Must-follow when the led card is trump and you only hold the left bower
- Right > Left > non-bower trump comparison
- Stick-the-dealer enforcement (`engine: bidding flow + stick the dealer`)
- Round 2 cannot call upcard's suit
- Each scoring branch (4, 2, 1, euchre) (`engine: scoring matrix`)
- Dealer-discard moves upcard into hand and triggers discard
- Spectator redaction hides every hand

Run: `npm test`.
