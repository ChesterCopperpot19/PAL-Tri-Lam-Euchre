'use client';
// Step through one recorded hand with all four hands face up. Each card gets a
// double-dummy verdict ("with every card visible"): a best play, or how many
// tricks it gave away and which card was better.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Card, HandSummary, SeatIndex, TrickPlay } from '@/server/engine/types';
import type { HandAnalysis, PlayVerdict } from '@/lib/solver/analyze';
import { sortHand } from '@/lib/hand-sort';
import { SuitGlyph } from '@/components/Card';
import MiniCard, { CardText } from './MiniCard';
import SwingChart from './SwingChart';

const GOLD = '#FFB81C';
type Pos = 'top' | 'left' | 'right' | 'bottom';
// Fixed compass: South at the bottom, as on the live table's default view.
const POS_OF: Record<number, Pos> = { 0: 'bottom', 1: 'left', 2: 'top', 3: 'right' };

export default function HandReplay({
  hand,
  analysis,
  names,
  initialStep = 0,
}: {
  hand: HandSummary;
  /** undefined while solving; null when the hand can't be analysed. */
  analysis: HandAnalysis | null | undefined;
  names: Record<number, string>;
  /** Cards already played when the replay opens (from the ?card= link). */
  initialStep?: number;
}) {
  const plays: TrickPlay[] = useMemo(() => (hand.tricks ?? []).flatMap((t) => t.plays), [hand]);
  const active = hand.alone ? 3 : 4;
  const n = plays.length;
  const [step, setStep] = useState(() => Math.max(0, Math.min(n, initialStep)));
  const go = useCallback((s: number) => setStep(Math.max(0, Math.min(n, s))), [n]);

  // Keep ?card= in step with the replay, so any position can be shared as a link.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (step === 0) url.searchParams.delete('card');
    else url.searchParams.set('card', String(step));
    window.history.replaceState(window.history.state, '', url);
  }, [step]);

  // Arrow keys step, Home/End jump. Ignored while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') setStep((s) => Math.min(n, s + 1));
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
      else if (e.key === 'Home') setStep(0);
      else if (e.key === 'End') setStep(n);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n]);

  const sittingOut = hand.alone ? ((hand.maker + 2) % 4) : null;
  const dealt = useMemo(() => {
    const d: Record<number, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
    for (const p of plays) d[p.seat].push(p.card);
    for (const s of [0, 1, 2, 3]) d[s] = sortHand(d[s], hand.trump);
    return d;
  }, [plays, hand.trump]);
  const playedIds = new Set(plays.slice(0, step).map((p) => p.card.id));

  // The trick on the felt: the one the latest card belongs to.
  const trickIdx = step === 0 ? -1 : Math.floor((step - 1) / active);
  const onFelt = trickIdx < 0 ? [] : plays.slice(trickIdx * active, step);
  const trickDone = onFelt.length === active;
  const trickWinner = trickDone ? hand.tricks![trickIdx].winner : undefined;
  const toPlay = step < n ? plays[step].seat : null;
  const latest: PlayVerdict | null = analysis && step > 0 ? analysis.plays[step - 1] : null;

  return (
    <div className="space-y-4">
      {/* The table: every hand face up. */}
      <section
        aria-label="The table"
        className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 sm:gap-3 items-center"
      >
        <div className="col-span-3 justify-self-center">
          <Seat seat={2} {...{ hand, names, dealt, playedIds, toPlay, sittingOut }} />
        </div>
        <Seat seat={1} vertical {...{ hand, names, dealt, playedIds, toPlay, sittingOut }} />
        <Felt plays={onFelt} winner={trickWinner} step={step} upcard={hand.upcard ?? null} />
        <Seat seat={3} vertical {...{ hand, names, dealt, playedIds, toPlay, sittingOut }} />
        <div className="col-span-3 justify-self-center">
          <Seat seat={0} {...{ hand, names, dealt, playedIds, toPlay, sittingOut }} />
        </div>
      </section>

      {/* Step controls. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <CtlButton label="First card" onClick={() => go(0)} disabled={step === 0}>⏮</CtlButton>
          <CtlButton label="Previous card" onClick={() => go(step - 1)} disabled={step === 0}>◀</CtlButton>
          <CtlButton label="Next card" onClick={() => go(step + 1)} disabled={step === n} primary>▶</CtlButton>
          <CtlButton label="Last card" onClick={() => go(n)} disabled={step === n}>⏭</CtlButton>
        </div>
        <div className="text-xs text-white/60 tabular-nums">
          {step === 0 ? 'Before the opening lead' : `Card ${step} of ${n} · trick ${trickIdx + 1}`}
          <span className="hidden sm:inline text-white/40"> · ← → keys step</span>
        </div>
      </div>

      {/* Verdict for the latest card. */}
      <section aria-live="polite" className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4 min-h-[7.5rem]">
        {analysis === undefined ? (
          <p className="text-sm text-white/60">Checking every play…</p>
        ) : analysis === null ? (
          <p className="text-sm text-white/60">This hand’s record can’t be graded, but you can still step through it.</p>
        ) : !latest ? (
          <p className="text-sm text-white/85">
            With perfect play from here, the makers can force{' '}
            <strong className="text-white">{analysis.bestMakerTricks}</strong> trick
            {analysis.bestMakerTricks === 1 ? '' : 's'}. They took{' '}
            <strong className="text-white">{analysis.actualMakerTricks}</strong>.
            <HindsightNote />
          </p>
        ) : (
          <Verdict v={latest} names={names} />
        )}
      </section>

      {analysis && (
        <section className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
          <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">The swing</h2>
          <SwingChart analysis={analysis} names={names} step={step} onStep={go} />
        </section>
      )}

      <TrickList hand={hand} analysis={analysis ?? null} names={names} step={step} active={active} onStep={go} />
    </div>
  );
}

function HindsightNote() {
  return (
    <span className="block mt-1 text-[11px] uppercase tracking-wider text-white/45">
      With every card visible
    </span>
  );
}

function Verdict({ v, names }: { v: PlayVerdict; names: Record<number, string> }) {
  const forced = v.options.length === 1;
  const side = v.maker ? 'makers' : 'defenders';
  return (
    <div>
      <p className="text-sm text-white/85">
        <strong className="text-white">{names[v.seat]}</strong> ({side}) played <CardText card={v.card} />.
      </p>
      <p className="mt-1 text-base">
        {v.cost === 0 ? (
          <span className="text-white font-semibold">
            {forced ? '✓ Only legal card' : '✓ Best play'}
          </span>
        ) : (
          <span className="text-white font-semibold">
            ✗ Gave away {v.cost} trick{v.cost === 1 ? '' : 's'}. <CardText card={v.better!} /> was better.
          </span>
        )}
      </p>
      <HindsightNote />
      {!forced && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Every legal card and where it leads">
          {v.options.map((o) => {
            const isPlayed = o.card.id === v.card.id;
            return (
              <span
                key={o.card.id}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs border ${
                  isPlayed ? 'border-white/40 bg-white/10' : 'border-white/10 bg-black/30'
                }`}
              >
                <CardText card={o.card} />
                <span className="text-white/70">makers take {o.value}</span>
                {isPlayed && <span className="text-white/50">· played</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Seat({
  seat,
  vertical = false,
  hand,
  names,
  dealt,
  playedIds,
  toPlay,
  sittingOut,
}: {
  seat: SeatIndex;
  vertical?: boolean;
  hand: HandSummary;
  names: Record<number, string>;
  dealt: Record<number, Card[]>;
  playedIds: Set<string>;
  toPlay: number | null;
  sittingOut: number | null;
}) {
  const out = sittingOut === seat;
  const badges = [
    hand.dealer === seat && 'Dealer',
    hand.maker === seat && (hand.alone ? 'Maker · alone' : 'Maker'),
  ].filter(Boolean) as string[];
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0" role="group" aria-label={names[seat]}>
      <div
        className={`${vertical ? 'max-w-[4.75rem]' : 'max-w-[9rem]'} sm:max-w-[12rem] rounded-lg px-2 py-1 bg-black/45 border text-xs flex flex-wrap items-center justify-center gap-1 ${
          toPlay === seat ? 'border-gold' : 'border-white/10'
        }`}
      >
        <span className="truncate font-medium text-white/90" title={names[seat]}>
          {names[seat]}
        </span>
        {badges.map((b) => (
          <span key={b} className="text-[9px] uppercase tracking-wider bg-gold text-black rounded px-1 py-0.5">
            {b}
          </span>
        ))}
        {toPlay === seat && <span className="sr-only">to play</span>}
      </div>
      {out ? (
        <span className="text-[10px] uppercase tracking-wider bg-violet-500 text-white rounded px-1.5 py-0.5 font-semibold">
          Sitting out
        </span>
      ) : (
        <div className={`flex ${vertical ? 'flex-col' : 'flex-row'} gap-1`}>
          {dealt[seat].map((c) => (
            <MiniCard key={c.id} card={c} ghost={playedIds.has(c.id)} size={vertical ? 'sm' : 'md'} />
          ))}
        </div>
      )}
    </div>
  );
}

function Felt({
  plays,
  winner,
  step,
  upcard,
}: {
  plays: TrickPlay[];
  winner: number | undefined;
  step: number;
  upcard: Card | null;
}) {
  const at: Record<Pos, TrickPlay | undefined> = { top: undefined, left: undefined, right: undefined, bottom: undefined };
  for (const p of plays) at[POS_OF[p.seat]] = p;
  const place: Record<Pos, string> = {
    top: 'left-1/2 top-3 -translate-x-1/2',
    bottom: 'left-1/2 bottom-3 -translate-x-1/2',
    left: 'left-3 top-1/2 -translate-y-1/2',
    right: 'right-3 top-1/2 -translate-y-1/2',
  };
  return (
    <div className="felt relative mx-auto w-full min-w-[9.5rem] max-w-[15rem] aspect-square">
      {step === 0 && upcard && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <MiniCard card={upcard} />
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/70">Upcard</span>
        </div>
      )}
      {(Object.keys(at) as Pos[]).map((pos) => {
        const p = at[pos];
        return p ? (
          <div key={pos} className={`absolute ${place[pos]}`}>
            <MiniCard card={p.card} ring={winner === p.seat ? GOLD : undefined} />
          </div>
        ) : null;
      })}
    </div>
  );
}

function TrickList({
  hand,
  analysis,
  names,
  step,
  active,
  onStep,
}: {
  hand: HandSummary;
  analysis: HandAnalysis | null;
  names: Record<number, string>;
  step: number;
  active: number;
  onStep: (s: number) => void;
}) {
  return (
    <section className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
      <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">Every trick</h2>
      <ol className="space-y-1.5">
        {(hand.tricks ?? []).map((t, ti) => {
          const end = (ti + 1) * active;
          const current = step > ti * active && step <= end;
          return (
            <li key={ti}>
              <button
                onClick={() => onStep(end)}
                className={`w-full text-left rounded-lg px-2.5 py-2 border text-xs sm:text-sm flex flex-wrap items-center gap-x-3 gap-y-1 ${
                  current ? 'border-white/35 bg-white/10' : 'border-white/10 bg-black/25 hover:bg-white/5'
                }`}
              >
                <span className="text-white/55 w-14 shrink-0">Trick {ti + 1}</span>
                {t.plays.map((p, pi) => {
                  const v = analysis?.plays[ti * active + pi];
                  return (
                    <span key={p.card.id} className="inline-flex items-center gap-1">
                      <span className="text-white/70">{names[p.seat]}</span>
                      <CardText card={p.card} />
                      {t.winner === p.seat && <span aria-label="won the trick" title="Won the trick">🏆</span>}
                      {v && v.cost > 0 && (
                        <span className="rounded bg-white/10 px-1 text-[10px] text-white" title={`Gave away ${v.cost} (with every card visible)`}>
                          −{v.cost}
                        </span>
                      )}
                    </span>
                  );
                })}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CtlButton({
  label,
  onClick,
  disabled,
  primary = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`h-10 min-w-10 px-3 rounded-lg text-base font-semibold disabled:opacity-35 ${
        primary ? 'bg-gold text-black hover:brightness-110' : 'bg-white/10 hover:bg-white/20 border border-white/15'
      }`}
    >
      {children}
    </button>
  );
}

/** One line of the bidding: "West passed", "North ordered it up ♣ (alone)". */
export function BidLine({ hand, names }: { hand: HandSummary; names: Record<number, string> }) {
  if (!hand.bids || hand.bids.length === 0) return null;
  return (
    <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Bidding">
      {hand.bids.map((b, i) => (
        <li
          key={i}
          className={`rounded-md px-2 py-1 border ${
            b.action === 'pass' ? 'border-white/10 bg-black/25 text-white/60' : 'border-gold/50 bg-gold/10 text-white'
          }`}
        >
          {names[b.seat]}{' '}
          {b.action === 'pass' ? (
            'passed'
          ) : (
            <>
              {b.action === 'order' ? 'ordered it up' : 'called'}{' '}
              {b.suit && <SuitGlyph suit={b.suit} size={13} />}
              {b.alone && ' alone'}
            </>
          )}
          {i > 0 && hand.bids![i - 1].round !== b.round && <span className="sr-only"> (round 2)</span>}
        </li>
      ))}
    </ol>
  );
}
