// Duplicate tournament: the strong bot (src/lib/solver/strong-bot.ts) against the
// heuristic bot (src/server/engine/bot.ts). Each deal is played twice with the
// same cards, the strong bot on N/S one time and on E/W the other, so card luck
// cancels. Reports the strong side's point differential per hand, with a 95%
// confidence interval, and decision timings.
//
// Run: npx tsx scripts/bot-tournament.ts [--deals 2000] [--samples 20] [--threshold 0] [--workers 8] [--seed 1]
// Decisions use a fixed number of sampled deals (not a clock budget), so results
// don't depend on machine load.

import { fork } from 'child_process';
import os from 'os';
import { chooseBotAction } from '../src/server/engine/bot';
import { applyAction, createGame } from '../src/server/engine/game';
import type { GameState, SeatIndex } from '../src/server/engine/types';
import { TEAM_OF } from '../src/server/engine/types';
import { chooseStrongAction } from '../src/lib/solver/strong-bot';

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const DEALS = arg('deals', 2000);
const SAMPLES = arg('samples', 20);
const THRESHOLD = arg('threshold', 0);
const WORKERS = arg('workers', Math.max(1, os.cpus().length - 1));
const SEED = arg('seed', 1);

type HandOut = { diff: number; strongMs: number[]; phases: Record<string, number[]> };

/** Play one hand from the deal; `strongTeam` seats use the strong bot. */
function playHand(dealSeed: number, strongTeam: 'NS' | 'EW'): HandOut {
  let s: GameState = { ...createGame(), seed: dealSeed, dealer: (dealSeed % 4) as SeatIndex };
  s = applyAction(s, { type: 'START_HAND' }).state;
  const strongMs: number[] = [];
  const phases: Record<string, number[]> = {};
  for (let i = 0; i < 200 && s.phase !== 'HAND_END' && s.phase !== 'GAME_OVER'; i++) {
    const seat = s.turn;
    let action;
    if (TEAM_OF[seat] === strongTeam) {
      const r = chooseStrongAction(s, seat, {
        minSamples: SAMPLES,
        maxSamples: SAMPLES,
        budgetMs: 0,
        seed: dealSeed * 7 + i,
        bidThreshold: THRESHOLD,
      });
      action = r.action;
      strongMs.push(r.ms);
      (phases[s.phase] ??= []).push(r.ms);
    } else {
      action = chooseBotAction(s, seat);
    }
    s = applyAction(s, action).state;
  }
  const pts = s.lastHand!.pointsAwarded;
  const other = strongTeam === 'NS' ? 'EW' : 'NS';
  return { diff: pts[strongTeam] - pts[other], strongMs, phases };
}

function runShard(shard: number, of: number) {
  const out: { diffs: number[]; ms: number[]; phases: Record<string, number[]> } = { diffs: [], ms: [], phases: {} };
  for (let d = shard; d < DEALS; d += of) {
    const dealSeed = (SEED * 1_000_003 + d * 7919) >>> 0;
    const a = playHand(dealSeed, 'NS');
    const b = playHand(dealSeed, 'EW');
    // Per deal: the strong side's total over both seatings.
    out.diffs.push(a.diff + b.diff);
    out.ms.push(...a.strongMs, ...b.strongMs);
    for (const h of [a, b]) for (const [p, v] of Object.entries(h.phases)) (out.phases[p] ??= []).push(...v);
  }
  return out;
}

const pct = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

if (process.env.TOURNEY_SHARD) {
  const [i, k] = process.env.TOURNEY_SHARD.split('/').map(Number);
  process.send!(runShard(i, k));
} else {
  main();
}

async function main() {
  const t0 = Date.now();
  console.log(`Duplicate tournament: ${DEALS} deals × 2 seatings, ${SAMPLES} samples/decision, bid threshold ${THRESHOLD}, ${WORKERS} workers`);
  const results = await Promise.all(
    Array.from({ length: WORKERS }, (_, i) =>
      new Promise<ReturnType<typeof runShard>>((resolve, reject) => {
        const child = fork(process.argv[1], process.argv.slice(2), {
          env: { ...process.env, TOURNEY_SHARD: `${i}/${WORKERS}` },
          execArgv: process.execArgv,
        });
        child.on('message', (m) => resolve(m as ReturnType<typeof runShard>));
        child.on('error', reject);
        child.on('exit', (code) => code && reject(new Error(`shard ${i} exited ${code}`)));
      }),
    ),
  );
  const diffs = results.flatMap((r) => r.diffs);
  const ms = results.flatMap((r) => r.ms);
  const phases: Record<string, number[]> = {};
  for (const r of results) for (const [p, v] of Object.entries(r.phases)) (phases[p] ??= []).push(...v);

  // Per hand: each deal is two hands.
  const perHand = diffs.map((d) => d / 2);
  const n = perHand.length;
  const mean = perHand.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(perHand.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const half = (1.96 * sd) / Math.sqrt(n);
  const wins = diffs.filter((d) => d > 0).length;
  const losses = diffs.filter((d) => d < 0).length;
  console.log(`\nStrong bot, points per hand vs the heuristic bot: ${mean >= 0 ? '+' : ''}${mean.toFixed(3)}  (95% CI ${(mean - half).toFixed(3)} to ${(mean + half).toFixed(3)})`);
  console.log(`Deals won / tied / lost on the duplicate: ${wins} / ${n - wins - losses} / ${losses}`);
  console.log(`Strong decisions: ${ms.length}; ms median ${pct(ms, 0.5).toFixed(1)}, p95 ${pct(ms, 0.95).toFixed(1)}, max ${pct(ms, 1).toFixed(1)}`);
  for (const [p, v] of Object.entries(phases))
    console.log(`  ${p.padEnd(15)} n=${String(v.length).padStart(6)}  median ${pct(v, 0.5).toFixed(1)}  p95 ${pct(v, 0.95).toFixed(1)}  max ${pct(v, 1).toFixed(1)} ms`);
  console.log(`Wall time ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
