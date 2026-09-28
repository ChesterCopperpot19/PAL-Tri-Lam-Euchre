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
/** The worker has loaded and can take jobs. Until then requests fall back at once. */
let ready = false;
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
  w.on('message', (m: { ready?: boolean; id: number; ok: boolean; action?: Action; samples?: number; ms?: number; error?: string }) => {
    if (m.ready) {
      if (worker === w) ready = true;
      return;
    }
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
    if (worker === w) {
      worker = null;
      ready = false;
    }
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
  ready = false;
  return w;
}

/** Whether the worker has loaded (for tests). */
export const botPoolReady = () => ready;

/** Start the worker early (at server boot) so it's loaded before the first game. */
export function warmBotPool(): void {
  try {
    getWorker();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('could not start the strong bot worker:', (e as Error).message);
  }
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
    if (!ready) {
      // Still loading: play this move with the heuristic rather than wait.
      record(state.phase, 0, 0, true, true);
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
type Sample = { phase: string; ms: number; samples: number; fallback: boolean; cold?: boolean };
const recent: Sample[] = [];
function record(phase: string, ms: number, samples: number, fallback: boolean, cold = false) {
  recent.push({ phase, ms, samples, fallback, cold });
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
      /** Of the fallbacks: moves made while the worker was still loading. */
      coldStart: rs.filter((r) => r.cold).length,
      ms: { p50: pct(ok.map((r) => r.ms), 0.5), p95: pct(ok.map((r) => r.ms), 0.95) },
      samples: { p50: pct(ok.map((r) => r.samples), 0.5), p5: pct(ok.map((r) => r.samples), 0.05) },
    };
  };
  return {
    all: summarize(recent),
    byPhase: Object.fromEntries(phases.map((p) => [p, summarize(recent.filter((r) => r.phase === p))])),
  };
}
