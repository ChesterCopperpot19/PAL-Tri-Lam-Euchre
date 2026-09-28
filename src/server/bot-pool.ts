// Runs strong-bot decisions on a worker thread with a time budget. Callers get
// null on any trouble (worker error, stall, crash) and fall back to the heuristic
// bot, so a table never waits on the solver. Keeps a small, anonymous record of
// recent decision timings for tuning (GET /api/bot-stats).

import path from 'path';
import { Worker } from 'worker_threads';
import type { Action, GameState, SeatIndex } from './engine/types';

type Result = { action: Action; samples: number; ms: number };
type Pending = { resolve: (r: Result | null) => void; timer: NodeJS.Timeout; phase: string };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

/** Extra wall time allowed past the budget before the worker counts as stalled. */
const GRACE_MS = 1500;

function getWorker(): Worker {
  if (worker) return worker;
  // The server runs under tsx; the worker needs its CommonJS hook to load .ts
  // files and resolve the "@/..." path alias.
  const w = new Worker(path.join(__dirname, 'bot-worker.ts'), { execArgv: ['--require', 'tsx/cjs'] });
  w.unref(); // never keep the process alive on its own
  w.on('message', (m: { id: number; ok: boolean; action?: Action; samples?: number; ms?: number; error?: string }) => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) {
      record(p.phase, m.ms!, m.samples!, false);
      p.resolve({ action: m.action!, samples: m.samples!, ms: m.ms! });
    } else {
      // eslint-disable-next-line no-console
      console.error('strong bot error:', m.error);
      record(p.phase, 0, 0, true);
      p.resolve(null);
    }
  });
  const fail = (why: string) => {
    // eslint-disable-next-line no-console
    console.error(`strong bot worker ${why}; falling back to the heuristic bot`);
    if (worker === w) worker = null;
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      record(p.phase, 0, 0, true);
      p.resolve(null);
      pending.delete(id);
    }
  };
  w.on('error', (e) => fail(`error: ${e.message}`));
  w.on('exit', (code) => fail(`exited (${code})`));
  worker = w;
  return w;
}

/**
 * Ask the strong bot for `seat`'s move, thinking for about `budgetMs`.
 * Resolves null (caller falls back) if anything goes wrong.
 */
export function strongAction(state: GameState, seat: SeatIndex, budgetMs: number): Promise<Result | null> {
  return new Promise((resolve) => {
    let w: Worker;
    try {
      w = getWorker();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('could not start the strong bot worker:', (e as Error).message);
      resolve(null);
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      // Stalled: give up on this answer and restart the worker for the next one.
      pending.delete(id);
      record(state.phase, 0, 0, true);
      resolve(null);
      w.terminate().catch(() => {});
    }, budgetMs + GRACE_MS);
    timer.unref();
    pending.set(id, { resolve, timer, phase: state.phase });
    w.postMessage({ id, state, seat, budgetMs, seed: (Date.now() ^ (id * 2654435761)) >>> 0 });
  });
}

// ---- anonymous timing record for tuning ----
type Sample = { phase: string; ms: number; samples: number; fallback: boolean };
const recent: Sample[] = [];
function record(phase: string, ms: number, samples: number, fallback: boolean) {
  recent.push({ phase, ms, samples, fallback });
  if (recent.length > 500) recent.shift();
}

const pct = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] * 10) / 10;
};

/** Percentiles of recent decision times and sample counts, per phase. */
export function botStats() {
  const phases = [...new Set(recent.map((r) => r.phase))];
  const summarize = (rs: Sample[]) => {
    const ok = rs.filter((r) => !r.fallback);
    return {
      decisions: rs.length,
      fallbacks: rs.length - ok.length,
      ms: { p50: pct(ok.map((r) => r.ms), 0.5), p95: pct(ok.map((r) => r.ms), 0.95) },
      samples: { p50: pct(ok.map((r) => r.samples), 0.5), p5: pct(ok.map((r) => r.samples), 0.05) },
    };
  };
  return {
    all: summarize(recent),
    byPhase: Object.fromEntries(phases.map((p) => [p, summarize(recent.filter((r) => r.phase === p))])),
  };
}
