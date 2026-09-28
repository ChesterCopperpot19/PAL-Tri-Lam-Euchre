'use client';
// Analyses a game's hands in a shared Web Worker. Each hand is solved once per
// page load and cached by game id + hand index, so moving between a game and its
// hands never re-solves anything. A page can name one hand to solve first (the
// one on screen); the rest of the game follows. Falls back to the main thread
// if workers are unavailable.

import { useEffect, useState } from 'react';
import type { HandSummary } from '@/server/engine/types';
import { analyzeHand, type HandAnalysis } from './analyze';

type One = HandAnalysis | null;

const cache = new Map<string, Promise<One>>();
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: One[]) => void; hands: HandSummary[] }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./analyze.worker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<{ id: number; results: One[]; ms: number }>) => {
      pending.get(e.data.id)?.resolve(e.data.results);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      // Finish anything in flight on the main thread instead of hanging.
      worker?.terminate();
      worker = null;
      for (const { resolve, hands } of pending.values()) resolve(hands.map((h) => analyzeHand(h)));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function solve(hands: HandSummary[]): Promise<One[]> {
  const w = getWorker();
  if (!w) return Promise.resolve(hands.map((h) => analyzeHand(h)));
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve, hands });
    w.postMessage({ id, hands });
  });
}

/** Queue the given hands of a game (skipping cached ones) as one worker batch. */
function request(key: string, hands: HandSummary[], indices: number[]): void {
  const todo = indices.filter((i) => !cache.has(`${key}#${i}`));
  if (todo.length === 0) return;
  const start = performance.now();
  const batch = solve(todo.map((i) => hands[i])).then((r) => {
    // A User Timing entry per batch (DevTools → Performance, or
    // performance.getEntriesByType('measure')), so solve time is checkable.
    try {
      performance.measure(`solver:${key}#${todo.join(',')}`, { start });
    } catch {
      /* older browsers: no measure options */
    }
    return r;
  });
  todo.forEach((i, k) => cache.set(`${key}#${i}`, batch.then((r) => r[k])));
}

/** Promise form: every hand of a game, solved (and cached) in the worker. */
export function analyzeGame(key: string, hands: HandSummary[]): Promise<One[]> {
  const all = hands.map((_, i) => i);
  request(key, hands, all);
  return Promise.all(all.map((i) => cache.get(`${key}#${i}`)!));
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
    if (first !== undefined && first >= 0 && first < hands.length) request(key, hands, [first]);
    request(key, hands, all);
    const out: (One | undefined)[] = hands.map(() => undefined);
    setResult(out.slice());
    all.forEach((i) =>
      cache.get(`${key}#${i}`)!.then((a) => {
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
