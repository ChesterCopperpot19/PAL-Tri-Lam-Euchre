// Confirms the production solver (src/lib/solver) reproduces the prototype's
// per-hand results exactly, and times it. Local only: it reads the gitignored
// club snapshot.
//
// Input: data/club-hands.json and data/dd-baseline.json
//        (npx tsx scripts/fetch-club-snapshot.ts, then npx tsx scripts/prototype/solver-report.ts)
// Run:   npx tsx scripts/check-solver-baseline.ts   (exit 0 = exact match)

import fs from 'fs';
import path from 'path';
import { analyzeHand } from '../src/lib/solver/analyze';
import type { HandSummary } from '../src/server/engine/types';

const DATA = path.join(process.cwd(), 'data');
const full = JSON.parse(fs.readFileSync(path.join(DATA, 'club-hands.json'), 'utf8'));
const baseline: any[] = JSON.parse(fs.readFileSync(path.join(DATA, 'dd-baseline.json'), 'utf8'));
const want = new Map(baseline.map((b) => [`${b.game}#${b.hand}`, b]));

let hands = 0, mismatches = 0, unanalyzable = 0, reconcileFail = 0, flipped = 0;
const times: number[] = [];
for (const g of full.games) {
  (g.hands as HandSummary[]).forEach((h, hi) => {
    hands++;
    const t0 = performance.now();
    const a = analyzeHand(h);
    times.push(performance.now() - t0);
    if (!a) { unanalyzable++; console.log(`unanalyzable: ${g.id} hand ${hi + 1}`); return; }
    const got = {
      bestMakerTricks: a.bestMakerTricks,
      actualMakerTricks: a.actualMakerTricks,
      graded: a.plays.filter((p) => p.cost > 0).map((p) => ({
        seat: p.seat, trick: p.trick + 1, played: p.card.id, better: p.better!.id, cost: p.cost,
      })),
    };
    const b = want.get(`${g.id}#${hi + 1}`);
    const exp = b && { bestMakerTricks: b.bestMakerTricks, actualMakerTricks: b.actualMakerTricks, graded: b.graded };
    if (JSON.stringify(got) !== JSON.stringify(exp)) {
      mismatches++;
      console.log(`MISMATCH ${g.id} hand ${hi + 1}\n  got ${JSON.stringify(got)}\n  exp ${JSON.stringify(exp)}`);
    }
    const mk = a.plays.filter((p) => p.maker).reduce((s, p) => s + p.cost, 0);
    const df = a.plays.filter((p) => !p.maker).reduce((s, p) => s + p.cost, 0);
    if (a.bestMakerTricks - mk + df !== a.actualMakerTricks) reconcileFail++;
    if (a.decidedByMisplay) flipped++;
  });
}

times.sort((x, y) => x - y);
const pct = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))].toFixed(1);
console.log(`${hands} hands: ${hands - mismatches - unanalyzable} match the baseline, ${mismatches} mismatch, ${unanalyzable} unanalyzable`);
console.log(`reconcile failures: ${reconcileFail}; decided by a misplay: ${flipped}`);
console.log(`ms per hand: median ${pct(0.5)}, p95 ${pct(0.95)}, max ${pct(1)}`);
process.exit(mismatches || unanalyzable || reconcileFail ? 1 : 0);
