'use client';
// Analyses a game's hands in a shared Web Worker. Each hand is solved once per
// page load and cached by game id + hand index, so moving between a game and its
// hands never re-solves anything. A page can name one hand to solve first (the
// one on screen); the rest of the game follows. Fair grades ("with what they
// could see") are heavier, so they're computed only for a hand being replayed.
// Falls back to the main thread if workers are unavailable.

import { useEffect, useState } from 'react';
import type { HandSummary } from '@/server/engine/types';
import { analyzeHand, type HandAnalysis } from './analyze';
import { fairGrades, FAIR_SAMPLES, type FairVerdict } from './fair';

type One = HandAnalysis | null;
type Fair = (FairVerdict | null)[] | null;
type Kind = 'hindsight' | 'fair';

const run = {
  hindsight: (h: HandSummary): unknown => analyzeHand(h),
  fair: (h: HandSummary): unknown => fairGrades(h, FAIR_SAMPLES),
};

const cache = new Map<string, Promise<unknown>>();
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: unknown[]) => void; hands: HandSummary[]; kind: Kind }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./analyze.worker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<{ id: number; results: unknown[]; ms: number }>) => {
      pending.get(e.data.id)?.resolve(e.data.results);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      // Finish anything in flight on the main thread instead of hanging.
      worker?.terminate();
      worker = null;
      for (const { resolve, hands, kind } of pending.values()) resolve(hands.map(run[kind]));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function solve(kind: Kind, hands: HandSummary[]): Promise<unknown[]> {
  const w = getWorker();
  if (!w) return Promise.resolve(hands.map(run[kind]));
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve, hands, kind });
    w.postMessage({ id, kind, hands });
  });
}

/** Queue the given hands of a game (skipping cached ones) as one worker batch. */
function request(kind: Kind, key: string, hands: HandSummary[], indices: number[]): void {
  const k = (i: number) => `${kind}:${key}#${i}`;
  const todo = indices.filter((i) => !cache.has(k(i)));
  if (todo.length === 0) return;
  const start = performance.now();
  const batch = solve(kind, todo.map((i) => hands[i])).then((r) => {
    // A User Timing entry per batch (DevTools → Performance, or
    // performance.getEntriesByType('measure')), so solve time is checkable.
    try {
      performance.measure(`solver:${kind}:${key}#${todo.join(',')}`, { start });
    } catch {
      /* older browsers: no measure options */
    }
    return r;
  });
  todo.forEach((i, j) => cache.set(k(i), batch.then((r) => r[j])));
}

/** Promise form: every hand of a game, solved (and cached) in the worker. */
export function analyzeGame(key: string, hands: HandSummary[]): Promise<One[]> {
  const all = hands.map((_, i) => i);
  request('hindsight', key, hands, all);
  return Promise.all(all.map((i) => cache.get(`hindsight:${key}#${i}`)! as Promise<One>));
}

/**
 * Analyse every hand of a game. Returns one entry per hand: undefined while that
 * hand is still solving, null if it can't be analysed. `first` is solved ahead
 * of the rest.
 */
export function useGameAnalysis(
  key: string | null,
  hands: HandSummary[] | undefined,
  first?: number,
): (One | undefined)[] | null {
  const [result, setResult] = useState<(One | undefined)[] | null>(null);
  useEffect(() => {
    setResult(null);
    if (!key || !hands || hands.length === 0) return;
    let alive = true;
    const all = hands.map((_, i) => i);
    if (first !== undefined && first >= 0 && first < hands.length) request('hindsight', key, hands, [first]);
    request('hindsight', key, hands, all);
    const out: (One | undefined)[] = hands.map(() => undefined);
    setResult(out.slice());
    all.forEach((i) =>
      (cache.get(`hindsight:${key}#${i}`)! as Promise<One>).then((a) => {
        if (!alive) return;
        out[i] = a;
        setResult(out.slice());
      }),
    );
    return () => {
      alive = false;
    };
  }, [key, hands, first]);
  return result;
}

/** Fair grades for one hand (undefined while solving). Queued after the
 *  hindsight batch for the same page, so those verdicts land first. */
export function useFairGrades(key: string | null, hands: HandSummary[] | undefined, index: number): Fair | undefined {
  const [result, setResult] = useState<Fair | undefined>(undefined);
  useEffect(() => {
    setResult(undefined);
    if (!key || !hands || index < 0 || index >= hands.length) return;
    let alive = true;
    request('fair', key, hands, [index]);
    (cache.get(`fair:${key}#${index}`)! as Promise<Fair>).then((f) => alive && setResult(f));
    return () => {
      alive = false;
    };
  }, [key, hands, index]);
  return result;
}
