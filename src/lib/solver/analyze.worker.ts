// Web Worker: runs the solvers off the main thread so the page stays responsive.
// { id, kind, hands } → { id, results }. 'hindsight' is the double-dummy grading
// (every card visible); 'fair' grades each card on what its player could see;
// 'decisions' is the compact per-card summary behind profile stats.

import type { HandSummary } from '@/server/engine/types';
import { analyzeHand } from './analyze';
import { fairGrades, FAIR_SAMPLES } from './fair';
import { gradeHandDecisions } from './decisions';

type Msg = { id: number; kind: 'hindsight' | 'fair' | 'decisions'; hands: HandSummary[] };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Msg>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e) => {
  const { id, kind, hands } = e.data;
  const t0 = performance.now();
  const results =
    kind === 'fair'
      ? hands.map((h) => fairGrades(h, FAIR_SAMPLES))
      : kind === 'decisions'
        ? hands.map((h) => gradeHandDecisions(h))
        : hands.map((h) => analyzeHand(h));
  ctx.postMessage({ id, results, ms: performance.now() - t0 });
};
