// PROTOTYPE, not app code. Double-dummy grading of every recorded club hand:
// plays each hand out perfectly with every card face up, then grades each real
// card against the best alternative. Built on the game's own rules module, so
// legality and trick winners are exactly the live engine's.
//
// Input:  data/club-meta.json, data/club-hands.json (npx tsx scripts/fetch-club-snapshot.ts)
// Run:    npx tsx scripts/prototype/solver-report.ts
// Output: a console report, plus data/dd-baseline.json with per-hand results. The
//         production solver should reproduce that baseline exactly.
//
// "Double-dummy" means hindsight: a flagged play may have been reasonable given
// what the player could actually see. See docs/plans/hand-analyzer-roadmap.md.

import fs from 'fs';
import path from 'path';
import { legalPlays, trickWinner } from '../../src/server/engine/rules';

type Card = { suit: string; rank: string; id: string };
type Play = { seat: number; card: Card };
type Hand = {
  trump: string; maker: number; alone: boolean;
  tricks: Array<{ plays: Play[]; winner: number }>;
};

const DATA = path.join(process.cwd(), 'data');
const meta = JSON.parse(fs.readFileSync(path.join(DATA, 'club-meta.json'), 'utf8'));
const full = JSON.parse(fs.readFileSync(path.join(DATA, 'club-hands.json'), 'utf8'));

const TEAM = (s: number) => (s % 2 === 0 ? 'NS' : 'EW');
const SUIT: Record<string, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
const show = (c: Card) => `${c.rank}${SUIT[c.suit]}`;
const legal = (hand: Card[], led: Card | null, trump: string) =>
  legalPlays(hand as any, led as any, trump as any) as unknown as Card[];

type Graded = {
  seat: number; trick: number; played: Card; better: Card; cost: number; maker: boolean;
};

function gradeHand(h: Hand) {
  const makerTeam = TEAM(h.maker);
  const out = h.alone ? [(h.maker + 2) % 4] : [];
  const active = 4 - out.length;
  const next = (s: number) => { let n = (s + 1) % 4; while (out.includes(n)) n = (n + 1) % 4; return n; };

  // Each seat held exactly the cards it played across the five tricks.
  const dealt: Record<number, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const t of h.tricks) for (const p of t.plays) dealt[p.seat].push(p.card);

  // Maker-team tricks still to come from a position, with perfect play by all four.
  // Memoised on (cards left per seat, current trick, whose turn): history is irrelevant.
  const memo = new Map<string, number>();
  function solve(hs: Record<number, Card[]>, plays: Play[], turn: number): number {
    if (plays.length === active) {
      const w = trickWinner(plays as any, h.trump as any) as number;
      const got = TEAM(w) === makerTeam ? 1 : 0;
      return hs[w].length === 0 ? got : got + solve(hs, [], w);
    }
    const key = [0, 1, 2, 3].map((s) => hs[s].map((c) => c.id).sort().join(',')).join('|')
      + '#' + plays.map((p) => p.card.id).join(',') + '#' + turn;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const max = TEAM(turn) === makerTeam;
    let best = max ? -1 : 99;
    for (const c of legal(hs[turn], plays[0]?.card ?? null, h.trump)) {
      const v = solve({ ...hs, [turn]: hs[turn].filter((x) => x.id !== c.id) }, [...plays, { seat: turn, card: c }], next(turn));
      best = max ? Math.max(best, v) : Math.min(best, v);
    }
    memo.set(key, best);
    return best;
  }

  let hs = { ...dealt };
  let won = 0;
  const graded: Graded[] = [];
  const best0 = solve(hs, [], h.tricks[0].plays[0].seat);
  h.tricks.forEach((t, ti) => {
    const plays: Play[] = [];
    for (const p of t.plays) {
      const max = TEAM(p.seat) === makerTeam;
      const vals = legal(hs[p.seat], plays[0]?.card ?? null, h.trump).map((c) => ({
        c,
        v: won + solve({ ...hs, [p.seat]: hs[p.seat].filter((x) => x.id !== c.id) }, [...plays, { seat: p.seat, card: c }], next(p.seat)),
      }));
      const top = vals.reduce((a, b) => (max ? (b.v > a.v ? b : a) : (b.v < a.v ? b : a)));
      const actual = vals.find((x) => x.c.id === p.card.id)!.v;
      const cost = max ? top.v - actual : actual - top.v;
      if (cost > 0) graded.push({ seat: p.seat, trick: ti + 1, played: p.card, better: top.c, cost, maker: max });
      hs = { ...hs, [p.seat]: hs[p.seat].filter((x) => x.id !== p.card.id) };
      plays.push(p);
    }
    if (TEAM(t.winner) === makerTeam) won++;
  });
  return { best0, won, graded, makerTeam };
}

// ---------- integrity checks: stop if the data or the solver can't be trusted ----------
let tricks = 0, winnerMismatch = 0, badDeals = 0, badReconcile = 0;
for (const g of full.games) for (const h of g.hands as Hand[]) {
  const seen = new Set<string>();
  for (const t of h.tricks) {
    tricks++;
    if (trickWinner(t.plays as any, h.trump as any) !== t.winner) winnerMismatch++;
    for (const p of t.plays) seen.add(p.card.id);
  }
  if (seen.size !== (h.alone ? 3 : 4) * 5) badDeals++;
}

// ---------- grade everything ----------
const playersOf = new Map<string, any[]>(meta.matches.map((m: any) => [m.id, m.players]));
const tsOf = new Map<string, number>(meta.matches.map((m: any) => [m.id, m.ts]));
const perPlayer = new Map<string, { plays: number; errs: number; tricks: number; bot: boolean }>();
const baseline: any[] = [];
const showcase: any[] = [];
let hands = 0, plays = 0, errors = 0, flipped = 0, missedMarch = 0, ms = 0;

for (const g of full.games) {
  const who = (s: number) => playersOf.get(g.id)?.find((p: any) => p.seat === s) ?? { name: `Seat ${s}`, isBot: false };
  (g.hands as Hand[]).forEach((h, hi) => {
    const t0 = Date.now();
    const r = gradeHand(h);
    ms += Date.now() - t0;
    hands++;
    const mk = r.graded.filter((e) => e.maker).reduce((a, e) => a + e.cost, 0);
    const df = r.graded.filter((e) => !e.maker).reduce((a, e) => a + e.cost, 0);
    if (r.best0 - mk + df !== r.won) badReconcile++; // every lost trick must be accounted for
    const flip = (r.best0 >= 3) !== (r.won >= 3);
    if (flip) flipped++;
    if (r.best0 === 5 && r.won < 5) missedMarch++;
    for (const t of h.tricks) for (const p of t.plays) {
      const w = who(p.seat);
      const e = perPlayer.get(w.name) ?? { plays: 0, errs: 0, tricks: 0, bot: !!w.isBot };
      e.plays++; plays++; perPlayer.set(w.name, e);
    }
    for (const e of r.graded) {
      const w = who(e.seat);
      const pp = perPlayer.get(w.name)!; pp.errs++; pp.tricks += e.cost; errors++;
      if (flip) showcase.push({ game: g.id, hand: hi + 1, date: new Date(tsOf.get(g.id) ?? 0).toLocaleDateString(), player: w.name, ...e, trump: h.trump });
    }
    baseline.push({ game: g.id, hand: hi + 1, bestMakerTricks: r.best0, actualMakerTricks: r.won,
      graded: r.graded.map((e) => ({ seat: e.seat, trick: e.trick, played: e.played.id, better: e.better.id, cost: e.cost })) });
  });
}

fs.writeFileSync(path.join(DATA, 'dd-baseline.json'), JSON.stringify(baseline, null, 1));

console.log('Integrity');
console.log(`  engine vs recorded trick winners: ${tricks - winnerMismatch}/${tricks} agree`);
console.log(`  hands with a complete, duplicate-free deal: ${hands - badDeals}/${hands}`);
console.log(`  hands whose grading reconciles to the final score: ${hands - badReconcile}/${hands}`);
if (winnerMismatch || badDeals || badReconcile) { console.error('INTEGRITY FAILURE, results not trustworthy'); process.exit(1); }

console.log(`\nSolved ${hands} hands (${plays} plays) in ${(ms / 1000).toFixed(1)}s, ${(ms / hands).toFixed(0)} ms per hand`);
console.log(`Plays that gave away a trick, with hindsight: ${errors} (1 in ${(plays / errors).toFixed(0)})`);
console.log(`Hands where a misplay flipped who scored: ${flipped}`);
console.log(`Marches available but missed: ${missedMarch}`);
console.log('\nTricks given away per 100 cards played (hindsight; small samples):');
[...perPlayer.entries()].sort((a, b) => a[1].tricks / a[1].plays - b[1].tricks / b[1].plays).forEach(([n, e]) =>
  console.log(`  ${n.padEnd(16)}${e.bot ? 'bot ' : '    '}${String(e.plays).padStart(4)} plays  ${(100 * e.tricks / e.plays).toFixed(1).padStart(5)}`));
console.log('\nShowcase hands for the prototype demo (a misplay changed who scored):');
showcase.sort((a, b) => b.cost - a.cost).slice(0, 8).forEach((s) =>
  console.log(`  game ${s.game} hand ${s.hand} (${s.date}): ${s.player}, trick ${s.trick}, ${s.maker ? 'maker' : 'defender'}, trump ${SUIT[s.trump]}, played ${show(s.played)}, ${show(s.better)} was worth ${s.cost} more`));
