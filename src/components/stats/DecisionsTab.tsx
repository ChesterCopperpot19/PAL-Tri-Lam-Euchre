'use client';
// Profile tab: how well a player chooses cards, graded on what they could see at
// the time (not hindsight), next to the club average. Also counts the bad-luck
// plays: ones that gave away a trick with every card visible but were sound.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { MatchRecord } from '@/lib/shared-types';
import type { Card, HandSummary, Rank, Suit } from '@/server/engine/types';
import { nameKey } from '@/lib/stats-analytics';
import { getHands } from '@/components/analyzer/useGameRecord';
import { CardText } from '@/components/analyzer/MiniCard';
import { aggregate, type DecisionStats } from '@/lib/solver/decisions';
import { useDecisions } from '@/lib/solver/useDecisions';

const cardOf = (id: string): Card => ({ id, rank: id.slice(0, -1) as Rank, suit: id.slice(-1) as Suit });

export default function DecisionsTab({ name, games }: { name: string; games: MatchRecord[] }) {
  // Card-by-card hands for the club's app-played games.
  const [full, setFull] = useState<Map<string, HandSummary[]> | null>(null);
  useEffect(() => {
    let alive = true;
    getHands().then((p) => alive && setFull(new Map(p.games.map((g) => [g.id, g.hands]))));
    return () => {
      alive = false;
    };
  }, []);
  const withCards = useMemo(
    () =>
      full
        ? games
            .filter((m) => full.get(m.id)?.some((h) => h.tricks?.length))
            .map((m) => ({ id: m.id, hands: full.get(m.id)! }))
        : null,
    [games, full],
  );
  const { graded, progress } = useDecisions(withCards);

  const result = useMemo(() => {
    if (!graded || !withCards) return null;
    const mine = [];
    const club = [];
    for (const g of withCards) {
      const hands = graded.get(g.id);
      const m = games.find((x) => x.id === g.id)!;
      if (!hands) continue;
      const seats = m.players.filter((p) => nameKey(p.name) === nameKey(name)).map((p) => p.seat as number);
      if (seats.length) mine.push({ gameId: g.id, hands, seats });
      club.push({ gameId: g.id, hands, seats: m.players.filter((p) => !p.isBot).map((p) => p.seat as number) });
    }
    return { me: aggregate(mine), club: aggregate(club).stats, games: mine.length };
  }, [graded, withCards, games, name]);

  if (!withCards || !result) {
    return (
      <section className="bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white/70">
        {progress && progress.total > 0 ? (
          <>
            <p>
              Grading every card played in the app… {progress.done} of {progress.total} hands
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
              <div className="h-full bg-gold" style={{ width: `${(100 * progress.done) / progress.total}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-white/45">This happens once; your browser keeps the results.</p>
          </>
        ) : (
          <p>Loading the club’s games…</p>
        )}
      </section>
    );
  }

  const { me, club } = result;
  const s = me.stats;
  if (s.decisions === 0) {
    return (
      <section className="bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white/70">
        No card-by-card games for {name} yet. Decision stats come from games played in the app.
      </section>
    );
  }
  const per100 = (x: number, st: DecisionStats) => (st.decisions ? (100 * x) / st.decisions : 0);

  return (
    <div className="space-y-4">
      <section className="bg-black/40 border border-white/10 rounded-2xl p-4">
        <h2 className="text-sm uppercase tracking-wider text-gold font-semibold">Decision quality</h2>
        <p className="text-[11px] text-white/50 mt-0.5 mb-3">
          Every card {name} chose, graded on what they could see at the time · {s.decisions} decisions in {result.games} app-played
          game{result.games === 1 ? '' : 's'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Tile
            label="Sound choices"
            value={`${Math.round((100 * s.sound) / s.decisions)}%`}
            sub={`club ${Math.round((100 * club.sound) / club.decisions)}%`}
          />
          <Tile
            label="Mistakes per 100"
            value={per100(s.mistakes, s).toFixed(1)}
            sub={`club ${per100(club.mistakes, club).toFixed(1)}`}
          />
          <Tile
            label="Points lost per 100"
            value={per100(s.pointsLost, s).toFixed(1)}
            sub={`club ${per100(club.pointsLost, club).toFixed(1)}`}
            hint="Expected points given up versus the best card"
          />
          <Tile
            label="Unlucky plays"
            value={String(s.unlucky)}
            sub={`of ${s.hindsightMisplays} hindsight misplays`}
            hint="Gave away a trick with every card visible, but were sound on what they could see"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs text-white/70">
          {(['maker', 'defender'] as const).map((role) => {
            const r = s.byRole[role];
            return (
              <div key={role} className="bg-black/25 border border-white/10 rounded-lg px-3 py-2">
                <div className="uppercase tracking-wider text-[10px] text-white/50">As {role === 'maker' ? 'a maker' : 'a defender'}</div>
                <div className="mt-0.5">
                  {r.decisions} decisions · {r.mistakes} mistake{r.mistakes === 1 ? '' : 's'} ·{' '}
                  {r.decisions ? ((100 * r.pointsLost) / r.decisions).toFixed(1) : '0.0'} points lost per 100
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-white/45">
          A card is a mistake only when another card was clearly better on average, by more than 0.1 points, across hundreds of
          deals consistent with what the player knew. Bidding isn’t graded yet. Small samples swing a lot.
        </p>
      </section>

      <section className="bg-black/40 border border-white/10 rounded-2xl p-4">
        <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">Costliest mistakes</h2>
        {me.mistakes.length === 0 ? (
          <p className="text-sm text-white/70">None. Every choice was sound or a close call.</p>
        ) : (
          <ol className="space-y-1.5">
            {me.mistakes.slice(0, 5).map((m) => (
              <li key={`${m.gameId}#${m.hand}#${m.step}`}>
                <Link
                  href={`/stats/games/${encodeURIComponent(m.gameId)}/hands/${m.hand}?card=${m.step}`}
                  className="block rounded-lg border border-white/10 bg-black/25 hover:bg-white/5 px-3 py-2 text-sm"
                >
                  Played <CardText card={cardOf(m.d.c)} /> in trick {m.d.t + 1}
                  {m.d.b && (
                    <>
                      ; <CardText card={cardOf(m.d.b)} /> was the better bet
                    </>
                  )}
                  <span className="text-white/60"> · about {m.d.f!.toFixed(1)} points on average</span>
                  <span className="float-right text-gold text-xs">Replay ›</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, sub, hint }: { label: string; value: string; sub: string; hint?: string }) {
  return (
    <div className="bg-black/30 border border-white/10 rounded-xl p-3 text-center" title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="font-display text-2xl text-white leading-tight mt-0.5">{value}</div>
      <div className="text-[11px] text-white/50">{sub}</div>
    </div>
  );
}
