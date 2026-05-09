'use client';
import { useState } from 'react';
import { SuitGlyph } from './Card';
import type { Suit } from '@/server/engine/types';
import type { RedactedState } from '@/server/engine/redact';

export default function BiddingPanel({
  state,
  isYourTurn,
  isDealer,
  dealerName,
  onOrder,
  onPass,
  onCall,
}: {
  state: RedactedState;
  isYourTurn: boolean;
  isDealer: boolean;
  /** Name of the dealer (for the "dealer takes the upcard" hint). */
  dealerName: string;
  onOrder: (alone: boolean) => void;
  onPass: () => void;
  onCall: (suit: Suit, alone: boolean) => void;
}) {
  const [alone, setAlone] = useState(false);

  if (!isYourTurn) {
    return (
      <div className="bg-black/45 border border-white/10 rounded-xl p-3 text-sm text-white/70">
        Waiting for {state.phase === 'BIDDING_1' ? 'a bid' : 'a call'}…
      </div>
    );
  }

  return (
    <div className="bg-black/55 border border-gold/40 rounded-xl p-3 sm:p-4 shadow-xl space-y-3 max-w-md">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/80">
          {state.phase === 'BIDDING_1'
            ? 'Order it up?'
            : isDealer
              ? 'Stick the dealer — call a suit:'
              : 'Call a suit (or pass):'}
        </div>
        <label className="text-xs text-white/70 flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={alone}
            onChange={(e) => setAlone(e.target.checked)}
            className="accent-gold"
          />
          Go alone
        </label>
      </div>

      {state.phase === 'BIDDING_1' && state.upcard && (
        <>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => onOrder(alone)}
              className="px-3 py-1.5 rounded-lg bg-pitt-blue hover:bg-[#1f4ea3] text-sm font-medium"
            >
              Order it up <SuitGlyph suit={state.upcard.suit} size={16} />
            </button>
            <button
              onClick={onPass}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium"
            >
              Pass
            </button>
          </div>
          <div className="text-[11px] text-white/60 leading-snug">
            {isDealer
              ? 'You’re the dealer — if anyone orders it up, you pick up the upcard and discard a card from your hand.'
              : `If ordered, the dealer (${dealerName}) takes the upcard and discards. You become "maker" but don’t take a card.`}
          </div>
        </>
      )}

      {state.phase === 'BIDDING_2' && state.upcard && (
        <div className="flex flex-wrap gap-2">
          {(['H', 'D', 'C', 'S'] as Suit[]).map((s) => {
            const disabled = s === state.upcard!.suit;
            return (
              <button
                key={s}
                onClick={() => onCall(s, alone)}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  disabled
                    ? 'bg-white/5 text-white/30 cursor-not-allowed'
                    : 'bg-pitt-blue hover:bg-[#1f4ea3]'
                }`}
                title={disabled ? 'Cannot call the upcard suit in round 2' : ''}
              >
                <SuitGlyph suit={s} size={16} />
              </button>
            );
          })}
          {!isDealer && (
            <button
              onClick={onPass}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium"
            >
              Pass
            </button>
          )}
        </div>
      )}
    </div>
  );
}
