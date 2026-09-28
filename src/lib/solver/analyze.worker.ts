// Web Worker: runs the double-dummy solver off the main thread so the page stays
// responsive. One message per game: { id, hands } → { id, results }.

import type { HandSummary } from '@/server/engine/types';
import { analyzeHand } from './analyze';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; hands: HandSummary[] }>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e) => {
  const { id, hands } = e.data;
  const t0 = performance.now();
  const results = hands.map((h) => analyzeHand(h));
  ctx.postMessage({ id, results, ms: performance.now() - t0 });
};
