// Worker thread for the strong bot: sampling + double-dummy search is CPU-heavy,
// so it runs here instead of on the Socket.io event loop. One job at a time.

import { parentPort } from 'worker_threads';
import { chooseStrongAction } from '@/lib/solver/strong-bot';
import type { GameState, SeatIndex } from '@/server/engine/types';

type Job = { id: number; state: GameState; seat: SeatIndex; budgetMs: number; seed: number };

// Loading this file (and compiling it under tsx) takes seconds on a slow host,
// so say when we're ready; until then the server uses the heuristic bot.
parentPort!.postMessage({ ready: true });

parentPort!.on('message', (job: Job) => {
  try {
    const r = chooseStrongAction(job.state, job.seat, { budgetMs: job.budgetMs, seed: job.seed });
    parentPort!.postMessage({ id: job.id, ok: true, ...r });
  } catch (e) {
    parentPort!.postMessage({ id: job.id, ok: false, error: (e as Error).message });
  }
});
