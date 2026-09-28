'use client';
// Hand replay: relive one hand of a recorded game card by card, with a verdict
// on every play (with every card visible).

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { SuitGlyph } from '@/components/Card';
import HandReplay, { BidLine } from '@/components/analyzer/HandReplay';
import MiniCard from '@/components/analyzer/MiniCard';
import { handResult, seatNames, useGameRecord } from '@/components/analyzer/useGameRecord';
import { useFairGrades, useGameAnalysis } from '@/lib/solver/useHandAnalysis';

export default function HandReplayPage() {
  const { id, hand } = useParams<{ id: string; hand: string }>();
  const n = Number(hand);
  const card = Number(useSearchParams().get('card')) || 0;
  const rec = useGameRecord(id);
  const ready = rec.status === 'ready' ? rec : null;
  // Solve the hand on screen first; the rest of the game follows in the background.
  const analyses = useGameAnalysis(ready?.fullHands ? id : null, ready?.fullHands ?? undefined, n - 1);
  const fair = useFairGrades(ready?.fullHands ? id : null, ready?.fullHands ?? undefined, n - 1);
  const gameHref = `/stats/games/${encodeURIComponent(id)}`;

  const hands = ready?.fullHands ?? null;
  const h = hands && Number.isInteger(n) && n >= 1 && n <= hands.length ? hands[n - 1] : null;
  const names = ready ? seatNames(ready.match) : {};

  return (
    <main className="min-h-screen px-3 sm:px-4 py-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">Hand replay</div>
          <h1 className="font-display text-3xl sm:text-4xl text-gold tracking-wide leading-tight">
            {h ? `Hand ${n}${hands ? ` of ${hands.length}` : ''}` : rec.status === 'loading' ? 'Loading…' : 'Hand not found'}
          </h1>
        </div>
        <Link
          href={gameHref}
          className="shrink-0 text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2"
        >
          ← Game
        </Link>
      </div>

      {rec.status !== 'loading' && !h && (
        <p className="bg-black/40 border border-white/10 rounded-2xl p-5 text-white/70">
          {ready && !ready.fullHands
            ? 'This game has no card-by-card record, so there’s nothing to replay.'
            : 'There’s no such hand in this game.'}{' '}
          <Link href={gameHref} className="text-gold underline underline-offset-2">
            Back to the game
          </Link>
        </p>
      )}

      {h && (
        <>
          <section className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4 mb-4 space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
              <span>Dealer {names[h.dealer ?? 0]}</span>
              {h.upcard && (
                <span className="inline-flex items-center gap-1.5">
                  Upcard <MiniCard card={h.upcard} size="sm" />
                  <span className="text-white/55">{h.orderedUp ? 'picked up' : 'turned down'}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                Trump <SuitGlyph suit={h.trump} size={16} />
              </span>
            </div>
            <BidLine hand={h} names={names} />
            <p className="text-sm text-white font-medium">{handResult(h, names)}</p>
          </section>

          <HandReplay
            key={`${id}#${n}`}
            hand={h}
            analysis={analyses ? analyses[n - 1] : undefined}
            names={names}
            fair={fair}
            initialStep={card}
          />

          <nav className="mt-5 flex items-center justify-between gap-3 text-sm" aria-label="Other hands">
            {n > 1 ? (
              <Link href={`${gameHref}/hands/${n - 1}`} className="bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2">
                ← Hand {n - 1}
              </Link>
            ) : (
              <span />
            )}
            {hands && n < hands.length && (
              <Link href={`${gameHref}/hands/${n + 1}`} className="bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2">
                Hand {n + 1} →
              </Link>
            )}
          </nav>
        </>
      )}
    </main>
  );
}
