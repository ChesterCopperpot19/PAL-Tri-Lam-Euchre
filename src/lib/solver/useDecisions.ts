'use client';
// Grades every card decision of the club's app-played games for profile stats.
// Heavier than a single replay, so the hands are spread over a small pool of Web
// Workers, and each game's results are kept in localStorage: recorded games never
// change, so a second visit is instant.

import { useEffect, useState } from 'react';
import type { HandSummary } from '@/server/engine/types';
import { DECISIONS_VERSION, PROFILE_SAMPLES, gradeHandDecisions, type Decision } from './decisions';

type GameHands = { id: string; hands: HandSummary[] };
export type GradedHands = Map<string, (Decision[] | null)[]>;

const storeKey = (id: string) => `euchre.decisions.v${DECISIONS_VERSION}.s${PROFILE_SAMPLES}.${id}`;

function loadCached(id: string): (Decision[] | null)[] | null {
  try {
    const raw = localStorage.getItem(storeKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCached(id: string, v: (Decision[] | null)[]) {
  try {
    localStorage.setItem(storeKey(id), JSON.stringify(v));
  } catch {
    /* storage full or blocked: fine, we just recompute next time */
  }
}

// Shared across hook instances for this page load.
const memory: GradedHands = new Map();

/** Grade the given games' hands; reports progress as hands finish. */
async function gradeAll(games: GameHands[], onProgress: (done: number, total: number) => void): Promise<GradedHands> {
  const todo: { game: string; index: number; hand: HandSummary }[] = [];
  for (const g of games) {
    if (memory.has(g.id)) continue;
    const cached = loadCached(g.id);
    if (cached && cached.length === g.hands.length) {
      memory.set(g.id, cached);
      continue;
    }
    g.hands.forEach((hand, index) => todo.push({ game: g.id, index, hand }));
  }
  const total = todo.length;
  let done = 0;
  onProgress(0, total);
  const results = new Map<string, (Decision[] | null)[]>();
  for (const g of games) if (!memory.has(g.id)) results.set(g.id, new Array(g.hands.length).fill(null));

  const size = typeof Worker === 'undefined' ? 0 : Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  if (size === 0) {
    for (const t of todo) {
      results.get(t.game)![t.index] = gradeHandDecisions(t.hand);
      onProgress(++done, total);
      await new Promise((r) => setTimeout(r)); // let the page breathe
    }
  } else {
    // Each worker takes the next hand when it finishes one.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(size, total) }, async () => {
        const w = new Worker(new URL('./analyze.worker.ts', import.meta.url));
        try {
          while (next < todo.length) {
            const t = todo[next++];
            const r = await new Promise<(Decision[] | null)[]>((resolve, reject) => {
              w.onmessage = (e) => resolve(e.data.results);
              w.onerror = (e) => reject(e);
              w.postMessage({ id: 0, kind: 'decisions', hands: [t.hand] });
            }).catch(() => [gradeHandDecisions(t.hand)]);
            results.get(t.game)![t.index] = r[0];
            onProgress(++done, total);
          }
        } finally {
          w.terminate();
        }
      }),
    );
  }
  for (const [id, v] of results) {
    memory.set(id, v);
    saveCached(id, v);
  }
  return memory;
}

// One grading run at a time per set of games; later callers share it.
const runs = new Map<string, { promise: Promise<GradedHands>; listeners: Set<(d: number, t: number) => void>; last: [number, number] }>();

function shared(key: string, games: GameHands[], onProgress: (d: number, t: number) => void): Promise<GradedHands> {
  let run = runs.get(key);
  if (!run) {
    const listeners = new Set<(d: number, t: number) => void>();
    const r = { promise: null as unknown as Promise<GradedHands>, listeners, last: [0, 0] as [number, number] };
    r.promise = gradeAll(games, (d, t) => {
      r.last = [d, t];
      listeners.forEach((l) => l(d, t));
    });
    runs.set(key, r);
    run = r;
  }
  run.listeners.add(onProgress);
  onProgress(...run.last);
  return run.promise.finally(() => run!.listeners.delete(onProgress));
}

/** Graded hands for these games, with progress while grading. */
export function useDecisions(games: GameHands[] | null): {
  graded: GradedHands | null;
  progress: { done: number; total: number } | null;
} {
  const [graded, setGraded] = useState<GradedHands | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const key = games?.map((g) => g.id).join(',') ?? '';
  useEffect(() => {
    if (!games) return;
    let alive = true;
    shared(key, games, (done, total) => alive && setProgress({ done, total })).then((m) => {
      if (alive) setGraded(new Map(m));
    });
    return () => {
      alive = false;
    };
    // `key` identifies the game set; the array itself is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { graded, progress };
}
