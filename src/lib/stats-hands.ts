// Flatten match records into per-hand rows for the "full hand-level data" view,
// and build a hand-grain CSV. Pure functions — unit-testable, no React/DOM.

import type { MatchRecord } from './shared-types';
import type { BidEntry, HandSummary, Suit, Trick } from '@/server/engine/types';
import { humanGames } from './stats-analytics';
import { SUIT_GLYPH as SUIT_SYMBOL } from './suits';

const TEAM_OF: Record<number, 'NS' | 'EW'> = { 0: 'NS', 2: 'NS', 1: 'EW', 3: 'EW' };

export function suitSymbol(s: Suit | null | undefined): string {
  return s ? SUIT_SYMBOL[s] : '';
}

/** "J♠", "10♥", or '' for a missing card. */
export function cardText(card: { rank: string; suit: Suit } | null | undefined): string {
  return card ? `${card.rank}${SUIT_SYMBOL[card.suit]}` : '';
}

export function handResultLabel(h: HandSummary): string {
  if (h.euchred) return 'Euchred';
  if (h.march) return h.alone ? 'Lone march' : 'March';
  return h.alone ? 'Loner made' : 'Made';
}

export type HandRow = {
  ts: number;
  gameId: string;
  handNo: number;
  /** Names indexed by seat 0..3 (for rendering bids/tricks). */
  seatNames: string[];
  nsNames: string[];
  ewNames: string[];
  finalScore: { NS: number; EW: number };
  dealer: string;
  maker: string;
  makerSeat: number;
  makerTeam: 'NS' | 'EW';
  trump: Suit | null;
  upcard: string;
  bidRound: 1 | 2 | null;
  alone: boolean;
  result: string;
  points: number;
  pointsTeam: 'NS' | 'EW' | null;
  makerTricks: number;
  defenderTricks: number;
  bids: BidEntry[];
  tricks: Trick[];
};

/** Return a copy of a match with each hand's heavy per-card fields (bids, tricks)
 *  removed, keeping every summary field. The default `stats:get` payload ships
 *  these slimmed hands; full bids/tricks load on demand via `stats:hands`. Pure —
 *  the original match is left untouched. */
export function slimMatchForList(m: MatchRecord): MatchRecord {
  if (!m.hands) return m;
  return {
    ...m,
    hands: m.hands.map((h) => {
      const summary = { ...h };
      delete summary.bids;
      delete summary.tricks;
      return summary;
    }),
  };
}

/** One row per hand, newest game first, across every match that has a hand log. */
export function flattenHands(matches: MatchRecord[]): HandRow[] {
  const rows: HandRow[] = [];
  for (const m of humanGames(matches)) {
    if (!m.hands || m.hands.length === 0) continue;
    const seatNames: string[] = ['', '', '', ''];
    for (const p of m.players) seatNames[p.seat] = p.name;
    const nsNames = m.players.filter((p) => p.team === 'NS').map((p) => p.name);
    const ewNames = m.players.filter((p) => p.team === 'EW').map((p) => p.name);
    m.hands.forEach((h, i) => {
      const makerTeam = TEAM_OF[h.maker];
      const defTeam = makerTeam === 'NS' ? 'EW' : 'NS';
      rows.push({
        ts: m.ts,
        gameId: m.id,
        handNo: i + 1,
        seatNames,
        nsNames,
        ewNames,
        finalScore: m.finalScore,
        dealer: h.dealer != null ? seatNames[h.dealer] : '',
        maker: seatNames[h.maker] || `Seat ${h.maker}`,
        makerSeat: h.maker,
        makerTeam,
        trump: h.trump,
        upcard: cardText(h.upcard ?? null),
        bidRound: h.bidRound ?? null,
        alone: h.alone,
        result: handResultLabel(h),
        points: h.pointsAwarded.NS + h.pointsAwarded.EW,
        pointsTeam: h.pointsAwarded.NS > 0 ? 'NS' : h.pointsAwarded.EW > 0 ? 'EW' : null,
        makerTricks: h.tricksByTeam[makerTeam],
        defenderTricks: h.tricksByTeam[defTeam],
        bids: h.bids ?? [],
        tricks: h.tricks ?? [],
      });
    });
  }
  return rows;
}

function bidsText(row: HandRow): string {
  return row.bids
    .map((b) => {
      const who = row.seatNames[b.seat] || `Seat ${b.seat}`;
      if (b.action === 'pass') return `${who}:pass`;
      return `${who}:${b.action}${suitSymbol(b.suit)}${b.alone ? '(alone)' : ''}`;
    })
    .join('; ');
}

function trickWinnersText(row: HandRow): string {
  return row.tricks
    .map((t, i) => {
      const w = t.winner != null ? row.seatNames[t.winner] || `Seat ${t.winner}` : '?';
      const card = t.winner != null ? t.plays.find((p) => p.seat === t.winner)?.card : undefined;
      return `T${i + 1}:${w}${card ? ' ' + cardText(card) : ''}`;
    })
    .join('; ');
}

function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+@]/.test(s)) s = `'${s}`; // neutralize spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Comprehensive hand-grain CSV: one row per hand, with bids and trick winners. */
export function handsToCSV(rows: HandRow[]): string {
  const headers = [
    'Date', 'Game ID', 'Hand', 'NS Players', 'EW Players', 'Final NS', 'Final EW',
    'Dealer', 'Maker', 'Maker Team', 'Trump', 'Up-card', 'Bid Round', 'Alone',
    'Result', 'Points', 'Points To', 'Maker Tricks', 'Defender Tricks', 'Bids', 'Trick Winners',
  ];
  const body = rows.map((r) => [
    new Date(r.ts).toISOString(),
    r.gameId, r.handNo, r.nsNames.join(' & '), r.ewNames.join(' & '),
    r.finalScore.NS, r.finalScore.EW, r.dealer, r.maker, r.makerTeam,
    r.trump ? suitSymbol(r.trump) : '', r.upcard,
    r.bidRound === 1 ? 'R1 (ordered up)' : r.bidRound === 2 ? 'R2 (named)' : '',
    r.alone ? 'yes' : 'no', r.result, r.points, r.pointsTeam ?? '',
    r.makerTricks, r.defenderTricks, bidsText(r), trickWinnersText(r),
  ]);
  return [headers, ...body].map((row) => row.map(csvCell).join(',')).join('\n');
}

// ── Calls by rank ────────────────────────────────────────────────────────────
// A trump call's "rank" = the up-card rank that was ordered up (round 1). Round-2
// calls name a suit with no card, so they fall in the "R2" bucket.

export const CALL_RANKS = ['J', 'A', 'K', 'Q', '10', '9', 'R2'] as const;
export type CallCategory = (typeof CALL_RANKS)[number];

export type PlayerCallRow = {
  name: string;
  total: number;
  counts: Record<CallCategory, number>;
  pct: Record<CallCategory, number>; // share of that player's own calls (0..1)
};

const emptyCalls = (): Record<CallCategory, number> => ({ J: 0, A: 0, K: 0, Q: 0, '10': 0, '9': 0, R2: 0 });

/** Club-wide call counts by rank + a per-player breakdown. Human games only. */
export function computeCallRanks(matches: MatchRecord[]): {
  byRank: Record<CallCategory, number>;
  total: number;
  players: PlayerCallRow[];
} {
  const byRank = emptyCalls();
  const perPlayer = new Map<string, Record<CallCategory, number>>();
  for (const m of humanGames(matches)) {
    if (!m.hands || m.hands.length === 0) continue;
    const seatName: string[] = [];
    for (const p of m.players) seatName[p.seat] = p.name;
    for (const h of m.hands) {
      const cat: CallCategory = h.bidRound === 1 && h.upcard ? h.upcard.rank : 'R2';
      byRank[cat] += 1;
      const name = seatName[h.maker] || `Seat ${h.maker}`;
      let pc = perPlayer.get(name);
      if (!pc) { pc = emptyCalls(); perPlayer.set(name, pc); }
      pc[cat] += 1;
    }
  }
  const total = CALL_RANKS.reduce((s, c) => s + byRank[c], 0);
  const players: PlayerCallRow[] = [...perPlayer.entries()]
    .map(([name, counts]) => {
      const t = CALL_RANKS.reduce((s, c) => s + counts[c], 0);
      const pct = emptyCalls();
      for (const c of CALL_RANKS) pct[c] = t ? counts[c] / t : 0;
      return { name, total: t, counts, pct };
    })
    .sort((a, b) => b.total - a.total);
  return { byRank, total, players };
}

// ── Calls by suit ────────────────────────────────────────────────────────────
// Which trump suits players like to call, and how those calls work out.

export const SUITS: Suit[] = ['S', 'H', 'C', 'D'];

const emptySuits = (): Record<Suit, number> => ({ H: 0, D: 0, C: 0, S: 0 });

export type PlayerSuitRow = {
  name: string;
  total: number;
  counts: Record<Suit, number>; // calls per suit
  share: Record<Suit, number>; // share of that player's own calls (0..1)
  made: Record<Suit, number>; // calls per suit that weren't euchred
  makePct: Record<Suit, number | null>; // made ÷ counts (null when no calls)
};

/** Club-wide + per-player trump-suit call breakdown. Human games only. */
export function computeCallSuits(matches: MatchRecord[]): {
  bySuit: Record<Suit, number>;
  madeBySuit: Record<Suit, number>;
  total: number;
  players: PlayerSuitRow[];
} {
  const bySuit = emptySuits();
  const madeBySuit = emptySuits();
  const perPlayer = new Map<string, { counts: Record<Suit, number>; made: Record<Suit, number> }>();
  for (const m of humanGames(matches)) {
    if (!m.hands || m.hands.length === 0) continue;
    const seatName: string[] = [];
    for (const p of m.players) seatName[p.seat] = p.name;
    for (const h of m.hands) {
      if (!h.trump) continue;
      bySuit[h.trump] += 1;
      if (!h.euchred) madeBySuit[h.trump] += 1;
      const name = seatName[h.maker] || `Seat ${h.maker}`;
      let pc = perPlayer.get(name);
      if (!pc) {
        pc = { counts: emptySuits(), made: emptySuits() };
        perPlayer.set(name, pc);
      }
      pc.counts[h.trump] += 1;
      if (!h.euchred) pc.made[h.trump] += 1;
    }
  }
  const total = SUITS.reduce((s, c) => s + bySuit[c], 0);
  const players: PlayerSuitRow[] = [...perPlayer.entries()]
    .map(([name, { counts, made }]) => {
      const t = SUITS.reduce((s, c) => s + counts[c], 0);
      const share = emptySuits();
      const makePct: Record<Suit, number | null> = { H: null, D: null, C: null, S: null };
      for (const c of SUITS) {
        share[c] = t ? counts[c] / t : 0;
        makePct[c] = counts[c] ? made[c] / counts[c] : null;
      }
      return { name, total: t, counts, share, made, makePct };
    })
    .sort((a, b) => b.total - a.total);
  return { bySuit, madeBySuit, total, players };
}

// ── Dealer-position analytics ────────────────────────────────────────────────
// Position 0 = dealer, 1 = left of dealer (eldest hand, bids first), 2 = across
// (dealer's partner), 3 = right of dealer.

export const POSITION_LABELS = ['Dealer', 'Left', 'Across', 'Right'] as const;

export type DealerPositionRow = {
  name: string;
  hands: [number, number, number, number]; // hands seen at each relative position
  calls: [number, number, number, number]; // trump calls made from that position
};

export type DealerStats = {
  /** Hands with a recorded dealer. */
  handsWithDealer: number;
  /** Of those, hands where the dealing team took the points. */
  dealerTeamWon: number;
  /** Net points for the dealing team, summed over those hands. */
  dealerTeamNet: number;
  positions: DealerPositionRow[];
  /** Stick-the-dealer: hands where all seven other bids passed and the dealer
   *  was forced to name trump in round 2. Needs the full bid log. */
  stuck: { count: number; made: number; euchred: number; net: number };
  /** False until the heavy bid log has loaded (stuck counts read 0 meanwhile). */
  stuckDetectable: boolean;
};

/** Dealer advantage + per-player call behavior by seat relative to the dealer. */
export function computeDealerStats(matches: MatchRecord[]): DealerStats {
  let handsWithDealer = 0;
  let dealerTeamWon = 0;
  let dealerTeamNet = 0;
  const perPlayer = new Map<string, DealerPositionRow>();
  const stuck = { count: 0, made: 0, euchred: 0, net: 0 };
  let sawBids = false;

  for (const m of humanGames(matches)) {
    if (!m.hands || m.hands.length === 0) continue;
    const seatName: string[] = [];
    for (const p of m.players) seatName[p.seat] = p.name;
    for (const h of m.hands) {
      if (h.dealer == null) continue;
      handsWithDealer += 1;
      const dealerTeam = TEAM_OF[h.dealer];
      const otherTeam = dealerTeam === 'NS' ? 'EW' : 'NS';
      const net = (h.pointsAwarded[dealerTeam] ?? 0) - (h.pointsAwarded[otherTeam] ?? 0);
      if (net > 0) dealerTeamWon += 1;
      dealerTeamNet += net;

      for (let seat = 0; seat < 4; seat++) {
        const name = seatName[seat];
        if (!name) continue;
        const pos = (seat - h.dealer + 4) % 4;
        let row = perPlayer.get(name);
        if (!row) {
          row = { name, hands: [0, 0, 0, 0], calls: [0, 0, 0, 0] };
          perPlayer.set(name, row);
        }
        row.hands[pos] += 1;
        if (seat === h.maker) row.calls[pos] += 1;
      }

      if (h.bids && h.bids.length) {
        sawBids = true;
        const nonPass = h.bids.filter((b) => b.action !== 'pass');
        const isStuck =
          nonPass.length === 1 &&
          nonPass[0].seat === h.dealer &&
          nonPass[0].round === 2 &&
          h.bids.length - 1 >= 7; // all four passed R1, other three passed R2
        if (isStuck) {
          stuck.count += 1;
          if (h.euchred) stuck.euchred += 1;
          else stuck.made += 1;
          const makerTeam = TEAM_OF[h.maker];
          const defTeam = makerTeam === 'NS' ? 'EW' : 'NS';
          stuck.net += (h.pointsAwarded[makerTeam] ?? 0) - (h.pointsAwarded[defTeam] ?? 0);
        }
      }
    }
  }

  const positions = [...perPlayer.values()].sort(
    (a, b) =>
      b.hands.reduce((s, n) => s + n, 0) - a.hands.reduce((s, n) => s + n, 0) ||
      a.name.localeCompare(b.name)
  );
  return { handsWithDealer, dealerTeamWon, dealerTeamNet, positions, stuck, stuckDetectable: sawBids };
}
