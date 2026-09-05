import { describe, it, expect } from 'vitest';
import { sortPlayers, type PlayerRow } from '../src/lib/stats-analytics';

/** Minimal PlayerRow with every numeric field zeroed; override what a test needs. */
function row(over: Partial<PlayerRow> & { name: string }): PlayerRow {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    winPct: 0,
    tricks: 0,
    defensiveTricks: 0,
    defensiveEuchres: 0,
    handsCalled: 0,
    callsWon: 0,
    callPct: 0,
    euchres: 0,
    marches: 0,
    loneCalled: 0,
    loneWon: 0,
    currentStreak: 0,
    longestWinStreak: 0,
    longestLossStreak: 0,
    recentForm: [],
    lastPlayed: 0,
    ppgFor: 0,
    ppgAgainst: 0,
    pointDiff: 0,
    marginStd: 0,
    bidPct: null,
    orderPct: null,
    netPtsPerCall: null,
    defEuchreRate: null,
    aloneMakePct: null,
    r1CallPct: null,
    r2CallPct: null,
    lonersFaced: null,
    lonersStopped: null,
    ...over,
  };
}

const names = (rows: PlayerRow[]) => rows.map((r) => r.name);

describe('sortPlayers null handling', () => {
  it('treats null/null as a tie and falls through to games, then name', () => {
    const rows = [
      row({ name: 'Zed', games: 3, bidPct: null }),
      row({ name: 'Amy', games: 3, bidPct: null }),
      row({ name: 'Bob', games: 9, bidPct: null }),
    ];
    // Games desc, then name asc — identical in both directions since the key ties.
    expect(names(sortPlayers(rows, 'bidPct', 'desc'))).toEqual(['Bob', 'Amy', 'Zed']);
    expect(names(sortPlayers(rows, 'bidPct', 'asc'))).toEqual(['Bob', 'Amy', 'Zed']);
  });

  it('is a valid comparator over all-null rows (no NaN) — sorting is stable and total', () => {
    const rows = ['e', 'd', 'c', 'b', 'a'].map((n) => row({ name: n, games: 1, orderPct: null }));
    expect(names(sortPlayers(rows, 'orderPct', 'desc'))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(names(sortPlayers(rows, 'orderPct', 'asc'))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('puts a null below a number in either direction', () => {
    const rows = [row({ name: 'NoData', games: 50, bidPct: null }), row({ name: 'Has', games: 1, bidPct: 0.2 })];
    expect(names(sortPlayers(rows, 'bidPct', 'desc'))).toEqual(['Has', 'NoData']);
    expect(names(sortPlayers(rows, 'bidPct', 'asc'))).toEqual(['Has', 'NoData']);
    // And with the operands reversed, so both comparator branches are exercised.
    const flipped = [rows[1], rows[0]];
    expect(names(sortPlayers(flipped, 'bidPct', 'desc'))).toEqual(['Has', 'NoData']);
    expect(names(sortPlayers(flipped, 'bidPct', 'asc'))).toEqual(['Has', 'NoData']);
  });

  it('sorts number/number by the key in both directions, nulls last', () => {
    const rows = [
      row({ name: 'Low', games: 2, bidPct: 0.1 }),
      row({ name: 'None', games: 9, bidPct: null }),
      row({ name: 'High', games: 2, bidPct: 0.9 }),
      row({ name: 'Mid', games: 2, bidPct: 0.5 }),
    ];
    expect(names(sortPlayers(rows, 'bidPct', 'desc'))).toEqual(['High', 'Mid', 'Low', 'None']);
    expect(names(sortPlayers(rows, 'bidPct', 'asc'))).toEqual(['Low', 'Mid', 'High', 'None']);
  });

  it('breaks numeric ties by games desc then name asc', () => {
    const rows = [
      row({ name: 'B', games: 4, winPct: 0.5 }),
      row({ name: 'A', games: 4, winPct: 0.5 }),
      row({ name: 'C', games: 8, winPct: 0.5 }),
    ];
    expect(names(sortPlayers(rows, 'winPct', 'desc'))).toEqual(['C', 'A', 'B']);
  });

  it('sorts the name column with localeCompare and honours direction', () => {
    const rows = [row({ name: 'bob' }), row({ name: 'Amy' }), row({ name: 'carl' })];
    expect(names(sortPlayers(rows, 'name', 'asc'))).toEqual(['Amy', 'bob', 'carl']);
    expect(names(sortPlayers(rows, 'name', 'desc'))).toEqual(['carl', 'bob', 'Amy']);
  });
});
