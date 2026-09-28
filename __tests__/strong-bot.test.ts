import { describe, it, expect } from 'vitest';
import { analyzeHand } from '../src/lib/solver/analyze';
import { createSolver, makerPoints } from '../src/lib/solver/dd';
import { infoFromState, rng, sampleDeal } from '../src/lib/solver/infoset';
import { chooseStrongAction } from '../src/lib/solver/strong-bot';
import { chooseBotAction } from '../src/server/engine/bot';
import { applyAction, createGame } from '../src/server/engine/game';
import { effectiveSuit, legalPlays } from '../src/server/engine/rules';
import type { Card, GameState, HandSummary, SeatIndex } from '../src/server/engine/types';

/** Play seeded bot hands, calling `visit` at every state before an action. */
function botHand(seed: number, visit?: (s: GameState) => void): HandSummary {
  let s: GameState = { ...createGame(), seed, dealer: (seed % 4) as SeatIndex };
  s = applyAction(s, { type: 'START_HAND' }).state;
  for (let i = 0; i < 200 && s.phase !== 'HAND_END' && s.phase !== 'GAME_OVER'; i++) {
    visit?.(s);
    s = applyAction(s, chooseBotAction(s, s.turn)).state;
  }
  return s.lastHand!;
}
const SEEDS = Array.from({ length: 60 }, (_, i) => 5000 + i * 104729);

describe('double-dummy core (dd.ts)', () => {
  it('matches the analyzer’s value for every option of every play', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const h = botHand(seed);
      const a = analyzeHand(h)!;
      const remaining: Record<number, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
      for (const s of [0, 1, 2, 3]) remaining[s] = a.dealt[s as SeatIndex].slice();
      let won = 0;
      const makerTeam = h.maker % 2;
      h.tricks!.forEach((t, ti) => {
        const trick: { seat: SeatIndex; card: Card }[] = [];
        for (const p of t.plays) {
          const v = a.plays.find((x) => x.trick === ti && x.seat === p.seat)!;
          const solver = createSolver({
            trump: h.trump,
            maker: h.maker,
            sittingOut: a.sittingOut,
            hands: remaining as Record<SeatIndex, Card[]>,
            trick: trick.slice(),
            turn: p.seat,
          });
          expect(solver.legalMoves().map((c) => c.id)).toEqual(v.options.map((o) => o.card.id));
          for (const o of v.options) {
            const tricks = won + solver.valueOfMove(o.card.id);
            expect(tricks).toBe(o.value);
            // The fast yes/no points search agrees with the exact trick count.
            expect(solver.pointsOfMove(o.card.id, won, h.alone)).toBe(makerPoints(tricks, h.alone));
          }
          remaining[p.seat] = remaining[p.seat].filter((x) => x.id !== p.card.id);
          trick.push(p);
        }
        if (t.winner! % 2 === makerTeam) won++;
      });
    }
  });
});

describe('information-set sampling', () => {
  it('deals only consistent hands: voids, counts, the upcard, nothing seen twice', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      botHand(seed, (s) => {
        if (s.phase !== 'PLAYING') return;
        const seat = s.turn;
        const info = infoFromState(s, seat);
        const rand = rng(seed + checked);
        for (let k = 0; k < 5; k++) {
          const deal = sampleDeal(info, rand)!;
          expect(deal).not.toBeNull();
          const seen = new Set<string>();
          for (const x of [0, 1, 2, 3] as SeatIndex[]) {
            expect(deal[x]).toHaveLength(info.counts[x]);
            for (const c of deal[x]) {
              expect(seen.has(c.id)).toBe(false);
              seen.add(c.id);
              expect(info.voids[x].has(effectiveSuit(c, s.trump))).toBe(false);
            }
          }
          for (const c of info.out) expect(seen.has(c.id)).toBe(false);
          expect(deal[seat].map((c) => c.id)).toEqual(s.hands[seat].map((c) => c.id));
          if (info.dealerHoldsUpcard) expect(deal[s.dealer].some((c) => c.id === s.upcard!.id)).toBe(true);
          // The true deal is always one of the possibilities: every seat's real
          // cards respect its revealed voids.
          for (const x of [0, 1, 2, 3] as SeatIndex[])
            for (const c of s.hands[x]) if (x !== info.sittingOut) expect(info.voids[x].has(effectiveSuit(c, s.trump))).toBe(false);
        }
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('knows its own discard as the dealer, and no one else does', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      botHand(seed, (s) => {
        if (s.phase !== 'PLAYING' || !s.dealerDiscard) return;
        const mine = infoFromState(s, s.dealer);
        expect(mine.out.some((c) => c.id === s.dealerDiscard!.id)).toBe(true);
        const other = infoFromState(s, ((s.dealer + 1) % 4) as SeatIndex);
        expect(other.out.some((c) => c.id === s.dealerDiscard!.id)).toBe(false);
      });
    }
  });
});

describe('strong bot', () => {
  it('always returns a legal action and finishes hands', () => {
    for (const seed of SEEDS.slice(0, 12)) {
      let s: GameState = { ...createGame(), seed, dealer: (seed % 4) as SeatIndex };
      s = applyAction(s, { type: 'START_HAND' }).state;
      for (let i = 0; i < 200 && s.phase !== 'HAND_END' && s.phase !== 'GAME_OVER'; i++) {
        const r = chooseStrongAction(s, s.turn, { minSamples: 4, maxSamples: 4, budgetMs: 0, seed: i });
        if (r.action.type === 'PLAY_CARD') {
          const legal = legalPlays(s.hands[s.turn], s.currentTrick.plays[0]?.card ?? null, s.trump);
          expect(legal.map((c) => c.id)).toContain(r.action.cardId);
        }
        s = applyAction(s, r.action).state; // throws on anything illegal
      }
      expect(['HAND_END', 'GAME_OVER']).toContain(s.phase);
    }
  });

  it('never sees hidden cards: its choice depends only on what the seat knows', () => {
    // Swap two unseen cards between the other hands: same information set, so
    // the same seeded decision.
    let compared = 0;
    for (const seed of SEEDS.slice(0, 20)) {
      botHand(seed, (s) => {
        if (s.phase !== 'PLAYING' || compared > 40) return;
        const seat = s.turn;
        const others = ([0, 1, 2, 3] as SeatIndex[]).filter((x) => x !== seat && !s.sittingOut.includes(x));
        const [a, b] = others;
        if (!s.hands[a].length || !s.hands[b].length) return;
        const ca = s.hands[a][0];
        const cb = s.hands[b][0];
        const info = infoFromState(s, seat);
        const t = s.trump!;
        // Only swap when neither move breaks a revealed void.
        if (info.voids[a].has(effectiveSuit(cb, t)) || info.voids[b].has(effectiveSuit(ca, t))) return;
        if (s.upcard && (ca.id === s.upcard.id || cb.id === s.upcard.id)) return;
        const swapped: GameState = {
          ...s,
          hands: { ...s.hands, [a]: [cb, ...s.hands[a].slice(1)], [b]: [ca, ...s.hands[b].slice(1)] },
        };
        const o = { minSamples: 6, maxSamples: 6, budgetMs: 0, seed: 99 };
        expect(chooseStrongAction(swapped, seat, o).action).toEqual(chooseStrongAction(s, seat, o).action);
        compared++;
      });
    }
    expect(compared).toBeGreaterThan(20);
  });
});
