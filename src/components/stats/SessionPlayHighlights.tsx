'use client';
// The night's costliest play and best play, from the double-dummy solver
// (hindsight: "with every card visible"). Only app-played games keep the cards,
// so the panel stays hidden for nights logged by hand or imported.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Session } from '@/lib/stats-sessions';
import { getHands } from '@/components/analyzer/useGameRecord';
import { CardText } from '@/components/analyzer/MiniCard';
import { analyzeGame } from '@/lib/solver/useHandAnalysis';
import { sessionHighlights, type Best, type Costliest } from '@/lib/solver/highlights';

export default function SessionPlayHighlights({ session }: { session: Session }) {
  const [hl, setHl] = useState<{ costliest: Costliest | null; best: Best | null } | null>(null);
  const withCards = session.games.filter((m) => m.hands?.length && (m.source ?? 'app') === 'app');
  const ids = withCards.map((m) => m.id).join(',');

  useEffect(() => {
    if (!ids) return;
    let alive = true;
    (async () => {
      const payload = await getHands();
      const full = new Map(payload.games.map((g) => [g.id, g.hands]));
      // Keep game numbers matching the night's order, counting every game.
      const games = await Promise.all(
        session.games.map(async (m) => {
          const hands = full.get(m.id);
          return { gameId: m.id, analyses: hands?.length ? await analyzeGame(m.id, hands) : [] };
        }),
      );
      if (alive) setHl(sessionHighlights(games));
    })();
    return () => {
      alive = false;
    };
    // `ids` captures which games matter; the session object is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  if (!ids || !hl || (!hl.costliest && !hl.best)) return null;
  const name = (gameId: string, seat: number) =>
    session.games.find((m) => m.id === gameId)?.players.find((p) => p.seat === seat)?.name ?? 'A player';
  const href = (r: { gameId: string; handNo: number; step: number }) =>
    `/stats/games/${encodeURIComponent(r.gameId)}/hands/${r.handNo}?card=${r.step}`;

  return (
    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {hl.costliest && (
        <div className="bg-black/30 border border-white/10 rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider text-white/50">💸 Costliest play</div>
          <p className="text-sm text-white/85 mt-1">
            {name(hl.costliest.gameId, hl.costliest.play.seat)} played <CardText card={hl.costliest.play.card} /> and gave
            away {hl.costliest.play.cost} trick{hl.costliest.play.cost === 1 ? '' : 's'}.{' '}
            <CardText card={hl.costliest.play.better!} /> was better
            {hl.costliest.flipped ? ', and it changed who scored.' : '.'}
          </p>
          <Footer href={href(hl.costliest)} gameNo={hl.costliest.gameNo} handNo={hl.costliest.handNo} />
        </div>
      )}
      {hl.best && (
        <div className="bg-black/30 border border-white/10 rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider text-white/50">🎯 Best play</div>
          <p className="text-sm text-white/85 mt-1">
            {name(hl.best.gameId, hl.best.play.seat)} found <CardText card={hl.best.play.card} />. Every other card would have
            given away {hl.best.margin === 1 ? 'a trick' : `at least ${hl.best.margin} tricks`}.
          </p>
          <Footer href={href(hl.best)} gameNo={hl.best.gameNo} handNo={hl.best.handNo} />
        </div>
      )}
    </div>
  );
}

function Footer({ href, gameNo, handNo }: { href: string; gameNo: number; handNo: number }) {
  return (
    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
      <span className="uppercase tracking-wider text-white/40">With every card visible</span>
      <Link href={href} className="text-gold hover:underline underline-offset-2 whitespace-nowrap">
        Game {gameNo}, hand {handNo} ›
      </Link>
    </div>
  );
}
