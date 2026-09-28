'use client';
// One recorded game: every hand with its dealer, trump, maker and result, and a
// badge on hands where a misplay changed who scored (with every card visible).
// Games from before card-by-card tracking get their summary and an explanation.

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SuitGlyph } from '@/components/Card';
import PlayerLink from '@/components/stats/PlayerLink';
import { handResult, seatNames, teamLabel, useGameRecord } from '@/components/analyzer/useGameRecord';
import { useGameAnalysis } from '@/lib/solver/useHandAnalysis';
import type { MatchRecord } from '@/lib/shared-types';

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const rec = useGameRecord(id);
  const ready = rec.status === 'ready' ? rec : null;
  const analyses = useGameAnalysis(ready?.fullHands ? id : null, ready?.fullHands ?? undefined);

  return (
    <main className="min-h-screen px-3 sm:px-4 py-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">Game</div>
          <h1 className="font-display text-2xl sm:text-4xl text-gold tracking-wide leading-tight">
            {ready ? <Matchup match={ready.match} /> : rec.status === 'missing' ? 'Game not found' : 'Loading…'}
          </h1>
          {ready && <p className="text-white/55 text-sm mt-1">{formatDate(ready.match.ts)}</p>}
        </div>
        <Link
          href="/stats/games"
          className="shrink-0 text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2"
        >
          ← All games
        </Link>
      </div>

      {rec.status === 'missing' && (
        <p className="bg-black/40 border border-white/10 rounded-2xl p-5 text-white/70">
          There’s no recorded game with this id. It may have been deleted.
        </p>
      )}

      {ready && !ready.fullHands && (
        <section className="bg-black/40 border border-white/10 rounded-2xl p-5 text-white/75 space-y-2">
          <p>
            Final score {ready.match.finalScore.NS}–{ready.match.finalScore.EW}
            {ready.match.handsPlayed > 0 && ` over ${ready.match.handsPlayed} hands`}.
          </p>
          <p className="text-sm text-white/60">
            {ready.match.source === 'historical'
              ? 'This game was imported from the club’s old records, which kept scores but not the cards, so there’s nothing to replay.'
              : ready.match.source === 'manual'
                ? 'This game was played in person and logged by hand, so the cards weren’t recorded and there’s nothing to replay.'
                : 'This game was played before the app kept a card-by-card record, so there’s nothing to replay.'}
          </p>
        </section>
      )}

      {ready?.fullHands && (
        <HandList id={id} match={ready.match} hands={ready.fullHands} analyses={analyses} />
      )}
    </main>
  );
}

function Matchup({ match }: { match: MatchRecord }) {
  const names = seatNames(match);
  const nsWon = match.winnerTeam === 'NS';
  return (
    <span className="block">
      <span className={nsWon ? '' : 'text-white/70'}>{teamLabel('NS', names)}</span>{' '}
      <span className="text-white/90 tabular-nums">{match.finalScore.NS}–{match.finalScore.EW}</span>{' '}
      <span className={!nsWon ? '' : 'text-white/70'}>{teamLabel('EW', names)}</span>
    </span>
  );
}

function HandList({
  id,
  match,
  hands,
  analyses,
}: {
  id: string;
  match: MatchRecord;
  hands: NonNullable<MatchRecord['hands']>;
  analyses: ReturnType<typeof useGameAnalysis>;
}) {
  const names = seatNames(match);
  const done = !!analyses && analyses.every((a) => a !== undefined);
  const decided = analyses?.filter((a) => a?.decidedByMisplay).length ?? 0;
  return (
    <section className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-sm uppercase tracking-wider text-gold font-semibold">Every hand</h2>
        <span className="text-[11px] text-white/50">
          {done
            ? `${decided} hand${decided === 1 ? '' : 's'} decided by a misplay, with every card visible`
            : 'Checking every play…'}
        </span>
      </div>
      <p className="text-xs text-white/55 mb-3">
        Players: {match.players
          .slice()
          .sort((a, b) => a.seat - b.seat)
          .map((p, i) => (
            <span key={p.seat}>
              {i > 0 && ' · '}
              <PlayerLink name={p.name} />
            </span>
          ))}
      </p>
      <ol className="space-y-1.5">
        {hands.map((h, i) => {
          const a = analyses?.[i];
          return (
            <li key={i}>
              <Link
                href={`/stats/games/${encodeURIComponent(id)}/hands/${i + 1}`}
                className="block rounded-lg border border-white/10 bg-black/25 hover:bg-white/5 hover:border-white/25 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white">Hand {i + 1}</span>
                  <span className="flex items-center gap-2">
                    {a?.decidedByMisplay && (
                      <span className="text-[10px] uppercase tracking-wider bg-gold text-black rounded px-1.5 py-0.5 font-semibold">
                        Decided by a misplay
                      </span>
                    )}
                    <span className="text-white/40" aria-hidden>
                      ›
                    </span>
                  </span>
                </div>
                <div className="text-xs text-white/65 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>Dealer {names[h.dealer ?? 0]}</span>
                  <span className="text-white/30">·</span>
                  <span className="inline-flex items-center gap-1">
                    Trump <SuitGlyph suit={h.trump} size={14} />
                  </span>
                  <span className="text-white/30">·</span>
                  <span>
                    {names[h.maker]} {h.bidRound === 2 ? 'called it' : 'ordered it up'}
                    {h.alone && ' alone'}
                  </span>
                  <span className="text-white/30">·</span>
                  <span>{handResult(h, names)}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
