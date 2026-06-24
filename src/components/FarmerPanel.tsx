'use client';
import { useState } from 'react';
import { CardFace } from './Card';
import type { Card } from '@/server/engine/types';

/** Shown during round-1 bidding when the viewer was dealt a farmer's hand
 *  (all 9s and 10s). Lets them swap three cards for the three buried kitty cards. */
export default function FarmerPanel({
  hand,
  onSwap,
}: {
  hand: Card[];
  onSwap: (cardIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s));

  if (!open) {
    return (
      <div className="bg-amber-900/30 border border-amber-400/40 rounded-xl p-3 text-sm text-amber-100 flex items-center justify-between gap-3 max-w-md">
        <span>
          🌾 <b>Farmer&rsquo;s hand!</b> All 9s &amp; 10s — you may swap 3 cards for the kitty.
        </span>
        <button
          onClick={() => setOpen(true)}
          className="bg-amber-500 text-black font-medium rounded-lg px-3 py-1.5 whitespace-nowrap hover:brightness-110"
        >
          Swap…
        </button>
      </div>
    );
  }

  return (
    <div className="bg-amber-900/30 border border-amber-400/40 rounded-xl p-3 space-y-2 max-w-md">
      <div className="text-sm text-amber-100">
        Pick <b>3</b> cards to bury and swap for the kitty ({sel.length}/3):
      </div>
      <div className="flex gap-2 justify-center flex-wrap">
        {hand.map((c) => (
          <div
            key={c.id}
            className={`rounded-lg transition ${
              sel.includes(c.id) ? 'ring-2 ring-amber-400 -translate-y-1' : ''
            }`}
          >
            <CardFace card={c} onClick={() => toggle(c.id)} size="sm" />
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-center">
        <button
          disabled={sel.length !== 3}
          onClick={() => onSwap(sel)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            sel.length === 3
              ? 'bg-amber-500 text-black hover:brightness-110'
              : 'bg-white/5 text-white/30 cursor-not-allowed'
          }`}
        >
          Swap these 3
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setSel([]);
          }}
          className="rounded-lg px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
