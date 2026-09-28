import { describe, it, expect } from 'vitest';
import { analyzeHand, unanalyzableReason } from '../src/lib/solver/analyze';
import { sessionHighlights } from '../src/lib/solver/highlights';
import { chooseBotAction } from '../src/server/engine/bot';
import { applyAction, createGame } from '../src/server/engine/game';
import { legalPlays, trickWinner } from '../src/server/engine/rules';
import type { Card, GameState, HandSummary, SeatIndex, Suit } from '../src/server/engine/types';

const C = (id: string): Card => {
  const rank = id.length === 3 ? id.slice(0, 2) : id[0];
  return { id, rank: rank as Card['rank'], suit: id[id.length - 1] as Suit };
};

/** Build a recorded hand from tricks written as "seat:card" lists; winners come
 *  from the engine, so a test only has to get the cards right. */
function handFrom(
  trump: Suit,
  maker: SeatIndex,
  tricks: string[][],
  alone = false,
): HandSummary {
  return {
    trump,
    maker,
    alone,
    tricksByTeam: { NS: 0, EW: 0 },
    tricksBySeat: { 0: 0, 1: 0, 2: 0, 3: 0 },
    pointsAwarded: { NS: 0, EW: 0 },
    euchred: false,
    march: false,
    tricks: tricks.map((t) => {
      const plays = t.map((s) => {
        const [seat, id] = s.split(':');
        return { seat: Number(seat) as SeatIndex, card: C(id) };
      });
      return { ledSuit: null, plays, winner: trickWinner(plays, trump) as SeatIndex };
    }),
  };
}

describe('solver: hand-built positions', () => {
  // Trump hearts, South (0) makes holding J♥ J♦ A♥ A♠ A♦. West's only trump is
  // the 9♥ and West has no spades, so pulling trump first marches. In the record
  // South leads the A♠ first and West trumps it: that lead gave away a trick.
  const giveaway = handFrom('H', 0, [
    ['0:AS', '1:9H', '2:9S', '3:10S'],
    ['1:AC', '2:9C', '3:KD', '0:JH'],
    ['0:JD', '1:9D', '2:10D', '3:QD'],
    ['0:AH', '1:KC', '2:10C', '3:QS'],
    ['0:AD', '1:QC', '2:KS', '3:JS'],
  ]);

  it('grades a lead that let the defenders trump in', () => {
    const a = analyzeHand(giveaway)!;
    expect(a.bestMakerTricks).toBe(5);
    expect(a.actualMakerTricks).toBe(4);
    const first = a.plays[0];
    expect(first.card.id).toBe('AS');
    expect(first.cost).toBe(1);
    expect(first.better?.id).toBe('JH');
    expect(a.missedMarch).toBe(true);
    expect(a.decidedByMisplay).toBe(false);
  });

  it('treats the last trick as forced: one card, no verdict', () => {
    const a = analyzeHand(giveaway)!;
    const last = a.plays.filter((p) => p.trick === 4);
    expect(last).toHaveLength(4);
    for (const p of last) {
      expect(p.options).toHaveLength(1);
      expect(p.cost).toBe(0);
    }
  });

  it('only offers cards that follow suit when a player can follow', () => {
    const a = analyzeHand(giveaway)!;
    // Trick 3 leads the J♦. That's the left bower, so the lead is trump, not a
    // diamond: East holds Q♦ but no trump, so any card is legal.
    const east3 = a.plays.find((p) => p.trick === 2 && p.seat === 3)!;
    expect(east3.options.map((o) => o.card.id).sort()).toEqual(['JS', 'QD', 'QS']);
    // Trick 1, North holds 9♠ and K♠ on a spade lead: must follow with a spade.
    const north1 = a.plays.find((p) => p.trick === 0 && p.seat === 2)!;
    expect(north1.options.map((o) => o.card.id).sort()).toEqual(['9S', 'KS']);
  });

  it('counts the left bower as trump, not as its printed suit', () => {
    // Trump spades; J♣ is the left bower. West leads K♣ and North holds J♣ plus
    // the 9♣: North must follow clubs with the 9♣ (J♣ is a spade now) and may
    // not "follow" with the J♣.
    const h = handFrom('S', 1, [
      ['1:KC', '2:9C', '3:AC', '0:QC'],
      ['3:JS', '0:9S', '1:10S', '2:JC'],
      ['3:AD', '0:9D', '1:10D', '2:KD'],
      ['3:AH', '0:9H', '1:10H', '2:KH'],
      ['3:QD', '0:QH', '1:JH', '2:JD'],
    ]);
    const a = analyzeHand(h)!;
    const north1 = a.plays.find((p) => p.trick === 0 && p.seat === 2)!;
    expect(north1.options.map((o) => o.card.id)).toEqual(['9C']);
    // On a trump lead North's only trump is the J♣, so it's forced.
    const north2 = a.plays.find((p) => p.trick === 1 && p.seat === 2)!;
    expect(north2.options.map((o) => o.card.id)).toEqual(['JC']);
    // The left bower beats the ten of trump but loses to the right bower.
    expect(h.tricks![1].winner).toBe(3);
  });

  it('handles a loner: three seats, partner sitting out', () => {
    // North (2) goes alone in clubs; South (0) sits out.
    const h = handFrom('C', 2, [
      ['3:9D', '1:10D', '2:AD'],
      ['2:JC', '3:9C', '1:10C'],
      ['2:JS', '3:QC', '1:KD'],
      ['2:AC', '3:KH', '1:QD'],
      ['2:KC', '3:AH', '1:QH'],
    ], true);
    expect(unanalyzableReason(h)).toBeNull();
    const a = analyzeHand(h)!;
    expect(a.sittingOut).toBe(0);
    expect(a.dealt[0]).toEqual([]);
    expect(a.plays).toHaveLength(15);
    expect(a.plays.every((p) => p.seat !== 0)).toBe(true);
    expect(a.actualMakerTricks).toBe(5);
  });

  it('picks the night’s costliest and best plays', () => {
    const a = analyzeHand(giveaway)!;
    const { costliest, best } = sessionHighlights([
      { gameId: 'g1', analyses: [null] },
      { gameId: 'g2', analyses: [a] },
    ]);
    expect(costliest).toMatchObject({ gameId: 'g2', gameNo: 2, handNo: 1, flipped: false });
    expect(costliest!.play.card.id).toBe('AS');
    expect(best!.play.cost).toBe(0);
    const played = best!.play.options.find((o) => o.card.id === best!.play.card.id)!.value;
    for (const o of best!.play.options)
      if (o.card.id !== best!.play.card.id)
        expect(best!.play.maker ? played - o.value : o.value - played).toBeGreaterThanOrEqual(best!.margin);
    expect(best!.margin).toBeGreaterThan(0);
  });

  it('refuses a record that does not replay', () => {
    const bad = handFrom('H', 0, [
      ['0:AS', '1:9H', '2:9S', '3:10S'],
      ['1:AC', '2:9C', '3:10C', '0:JH'],
    ]);
    expect(unanalyzableReason(bad)).not.toBeNull();
    expect(analyzeHand(bad)).toBeNull();
    const noCards = { ...giveaway, tricks: undefined };
    expect(analyzeHand(noCards)).toBeNull();
  });
});

// ---------- property tests: seeded bot games, no real data needed ----------

function playBotHand(seed: number): HandSummary {
  let s: GameState = { ...createGame(), seed, dealer: (seed % 4) as SeatIndex };
  s = applyAction(s, { type: 'START_HAND' }).state;
  for (let i = 0; i < 200; i++) {
    if (s.phase === 'HAND_END' || s.phase === 'GAME_OVER') return s.lastHand!;
    s = applyAction(s, chooseBotAction(s, s.turn)).state;
  }
  throw new Error(`seed ${seed}: hand did not finish`);
}

/** Independent exhaustive minimax straight off the engine's rules, no memo.
 *  Maker tricks from a mid-trick position, counting the trick in progress. */
function naive(
  hands: Record<number, Card[]>,
  trick: { seat: number; card: Card }[],
  turn: number,
  h: HandSummary,
  active: number,
  out: number | null,
): number {
  const makerTeam = h.maker % 2;
  const next = (x: number) => { let n = (x + 1) % 4; if (n === out) n = (n + 1) % 4; return n; };
  if (trick.length === active) {
    const w = trickWinner(trick, h.trump);
    const got = w % 2 === makerTeam ? 1 : 0;
    return hands[w].length === 0 ? got : got + naive(hands, [], w, h, active, out);
  }
  const max = turn % 2 === makerTeam;
  let best = max ? -1 : 99;
  for (const c of legalPlays(hands[turn], trick[0]?.card ?? null, h.trump)) {
    const v = naive({ ...hands, [turn]: hands[turn].filter((x) => x.id !== c.id) }, [...trick, { seat: turn, card: c }], next(turn), h, active, out);
    best = max ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

describe('solver: seeded bot hands', () => {
  const SEEDS = Array.from({ length: 150 }, (_, i) => 1000 + i * 7919);
  const hands = SEEDS.map(playBotHand);

  it('every hand replays, and grading reconciles to the tricks taken', () => {
    let loners = 0;
    for (const h of hands) {
      const a = analyzeHand(h);
      expect(a).not.toBeNull();
      if (!a) continue;
      if (h.alone) loners++;
      const makerCost = a.plays.filter((p) => p.maker).reduce((s, p) => s + p.cost, 0);
      const defCost = a.plays.filter((p) => !p.maker).reduce((s, p) => s + p.cost, 0);
      expect(a.bestMakerTricks - makerCost + defCost).toBe(a.actualMakerTricks);
      expect(a.actualMakerTricks).toBe(h.tricksByTeam[a.makerTeam]);
      expect(a.swing[0]).toBe(a.bestMakerTricks);
      expect(a.swing[a.swing.length - 1]).toBe(a.actualMakerTricks);
      for (const p of a.plays) {
        expect(p.cost).toBeGreaterThanOrEqual(0);
        expect(p.options.some((o) => o.card.id === p.card.id)).toBe(true);
      }
    }
    // The seeds should exercise a few loners too.
    expect(loners).toBeGreaterThan(0);
  });

  it('matches an independent exhaustive search from trick 3 on', () => {
    for (const h of hands.slice(0, 40)) {
      const a = analyzeHand(h)!;
      const out = a.sittingOut;
      const active = out === null ? 4 : 3;
      const remaining: Record<number, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
      for (const s of [0, 1, 2, 3]) remaining[s] = a.dealt[s as SeatIndex].slice();
      let won = 0;
      const makerTeam = h.maker % 2;
      h.tricks!.forEach((t, ti) => {
        const trick: { seat: number; card: Card }[] = [];
        for (const p of t.plays) {
          if (ti >= 2) {
            const verdict = a.plays.find((v) => v.trick === ti && v.seat === p.seat)!;
            for (const o of verdict.options) {
              const after = { ...remaining, [p.seat]: remaining[p.seat].filter((x) => x.id !== o.card.id) };
              const next = (() => { let n = (p.seat + 1) % 4; if (n === out) n = (n + 1) % 4; return n; })();
              expect(won + naive(after, [...trick, { seat: p.seat, card: o.card }], next, h, active, out)).toBe(o.value);
            }
          }
          remaining[p.seat] = remaining[p.seat].filter((x) => x.id !== p.card.id);
          trick.push(p);
        }
        if (t.winner! % 2 === makerTeam) won++;
      });
    }
  });
});
