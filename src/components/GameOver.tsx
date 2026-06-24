'use client';
import { useState } from 'react';
import type { RedactedState } from '@/server/engine/redact';
import type { RoomMember } from '@/lib/shared-types';
import { teamName } from '@/lib/format';
import StatsTable from './StatsTable';
import Scorecard from './Scorecard';

export default function GameOver({
  state,
  members,
  isSpectator = false,
  onRematch,
  onLeave,
}: {
  state: RedactedState;
  members: RoomMember[];
  /** Spectators can leave but not trigger a rematch. */
  isSpectator?: boolean;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const ns = teamName(members, 'NS');
  const ew = teamName(members, 'EW');
  const winner = state.scores.NS > state.scores.EW ? ns : ew;
  const [showCard, setShowCard] = useState(true);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Game over — ${winner} win`}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 py-6 overflow-y-auto"
    >
      <div className="bg-[#141B4D] border border-gold rounded-2xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl my-auto">
        <div className="text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60">Game over</div>
          <h2 className="font-display text-3xl sm:text-5xl text-gold mt-2 leading-tight break-words">
            {winner} win!
          </h2>
          <div className="mt-3 text-white/85 flex items-center justify-center gap-4 text-sm">
            <span>
              <span className="text-white/60 mr-1.5">{ns}</span>
              <span className="font-display text-xl text-gold">{state.scores.NS}</span>
            </span>
            <span className="text-white/30">·</span>
            <span>
              <span className="text-white/60 mr-1.5">{ew}</span>
              <span className="font-display text-xl text-gold">{state.scores.EW}</span>
            </span>
          </div>
        </div>

        <div className="mt-5">
          <StatsTable history={state.history} members={members} />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm uppercase tracking-wider text-gold font-semibold">
              📋 Round scorecard — every trick
            </h3>
            <button
              onClick={() => setShowCard((v) => !v)}
              className="text-xs bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-2.5 py-1"
            >
              {showCard ? 'Hide' : 'Show'}
            </button>
          </div>
          {showCard && (
            <div className="max-h-[48vh] overflow-y-auto pr-1">
              <Scorecard state={state} members={members} />
            </div>
          )}
        </div>

        <div className="text-center mt-5 flex items-center justify-center gap-3">
          {!isSpectator && (
            <button
              autoFocus
              onClick={onRematch}
              className="bg-gold text-black font-semibold rounded-lg px-5 py-2.5 hover:brightness-110"
            >
              🔁 Rematch
            </button>
          )}
          <button
            autoFocus={isSpectator}
            onClick={onLeave}
            className="bg-white/10 border border-white/20 text-white font-medium rounded-lg px-5 py-2.5 hover:bg-white/20"
          >
            Leave game
          </button>
        </div>
      </div>
    </div>
  );
}
