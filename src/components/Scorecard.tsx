'use client';
import type { RedactedState } from '@/server/engine/redact';
import type { RoomMember } from '@/lib/shared-types';
import type { Card, Suit } from '@/server/engine/types';

const SUIT_GLYPH: Record<Suit, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
const RED = new Set<Suit>(['H', 'D']);

function Sym({ s }: { s: Suit | null | undefined }) {
  if (!s) return <span className="text-white/30">—</span>;
  return <span className={RED.has(s) ? 'text-red-400' : 'text-white/90'}>{SUIT_GLYPH[s]}</span>;
}
const cardText = (c: Card) => `${c.rank}${SUIT_GLYPH[c.suit]}`;

function result(h: { euchred: boolean; march: boolean; alone: boolean }): string {
  if (h.euchred) return 'Euchred';
  if (h.march) return h.alone ? 'Lone march' : 'March';
  return h.alone ? 'Loner made' : 'Made';
}

/** Trick-by-trick scorecard for the whole game — every card, every trick winner.
 *  Relies on the full per-hand log, which the server sends only at GAME_OVER. */
export default function Scorecard({ state, members }: { state: RedactedState; members: RoomMember[] }) {
  const name = (seat: number) => members.find((m) => m.seat === seat)?.name ?? `Seat ${seat}`;
  const hands = state.history ?? [];
  if (hands.length === 0 || !hands.some((h) => h.tricks?.length)) {
    return <p className="text-white/50 text-sm">No trick detail recorded for this game.</p>;
  }
  return (
    <div className="space-y-2.5">
      {hands.map((h, i) => {
        const pts = h.pointsAwarded.NS + h.pointsAwarded.EW;
        const ptsTeam = h.pointsAwarded.NS > 0 ? 'NS' : 'EW';
        return (
          <div key={i} className="bg-black/30 border border-white/10 rounded-lg p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-semibold text-gold">Hand {i + 1}</span>
              <span className="text-white/75 text-right">
                Trump <Sym s={h.trump} /> · {name(h.maker)}
                {h.alone ? ' (alone)' : ''} · {result(h)} · {ptsTeam} +{pts}
              </span>
            </div>
            {(h.tricks ?? []).map((t, ti) => (
              <div key={ti} className="text-white/75 leading-relaxed">
                <span className="text-white/40">T{ti + 1}</span> led <Sym s={t.ledSuit} /> —{' '}
                {t.plays.map((p, pi) => (
                  <span key={pi} className={t.winner === p.seat ? 'text-gold font-medium' : ''}>
                    {pi > 0 && <span className="text-white/30">, </span>}
                    {name(p.seat)} {cardText(p.card)}
                    {t.winner === p.seat ? ' ✓' : ''}
                  </span>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
