// Flatten match records into per-hand rows for the "full hand-level data" view,
// and build a hand-grain CSV. Pure functions — unit-testable, no React/DOM.

import type { MatchRecord } from './shared-types';
import type { BidEntry, HandSummary, Suit, Trick } from '@/server/engine/types';

const SUIT_SYMBOL: Record<Suit, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
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

/** One row per hand, newest game first, across every match that has a hand log. */
export function flattenHands(matches: MatchRecord[]): HandRow[] {
  const rows: HandRow[] = [];
  for (const m of matches) {
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
  const s = String(v ?? '');
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
