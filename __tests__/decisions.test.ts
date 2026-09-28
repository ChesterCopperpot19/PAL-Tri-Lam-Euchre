import { describe, it, expect } from 'vitest';
import { aggregate, type Decision } from '../src/lib/solver/decisions';

const d = (s: number, g: Decision['g'], f: number | null, h = 0, m = true): Decision => ({ s, t: 0, c: 'AS', m, h, f, g, b: g === 'M' ? 'KS' : null });

describe('decision stats aggregation', () => {
  const hand: Decision[] = [
    d(0, 'S', 0, 0),
    d(1, 'M', 0.8, 0, false), // seat 1: a mistake that happened to work
    d(0, 'S', 0.05, 1), // seat 0: sound but gave away a trick in hindsight → unlucky
    d(2, null, null, 0), // forced card: not a decision
    d(0, 'M', 0.4, 1), // seat 0: mistake that also cost a trick
    d(0, 'C', 0.2, 0, false),
  ];

  it('counts only the chosen seats, skips forced cards, and splits luck from mistakes', () => {
    const { stats, mistakes } = aggregate([{ gameId: 'g', hands: [hand], seats: [0] }]);
    expect(stats.decisions).toBe(4);
    expect(stats.sound).toBe(2);
    expect(stats.close).toBe(1);
    expect(stats.mistakes).toBe(1);
    expect(stats.pointsLost).toBeCloseTo(0.65);
    expect(stats.hindsightMisplays).toBe(2);
    expect(stats.unlucky).toBe(1);
    expect(stats.byRole.maker).toEqual({ decisions: 3, mistakes: 1, pointsLost: 0.45 });
    expect(mistakes).toEqual([{ gameId: 'g', hand: 1, step: 5, d: hand[4] }]);
  });

  it('orders mistakes costliest first across games', () => {
    const { mistakes } = aggregate([
      { gameId: 'a', hands: [hand], seats: [0, 1] },
      { gameId: 'b', hands: [null, hand], seats: [1] },
    ]);
    expect(mistakes.map((m) => [m.gameId, m.hand, m.d.f])).toEqual([
      ['a', 1, 0.8],
      ['b', 2, 0.8],
      ['a', 1, 0.4],
    ]);
  });
});
