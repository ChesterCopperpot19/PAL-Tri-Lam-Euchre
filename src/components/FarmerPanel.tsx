'use client';
import { useState } from 'react';

/** Shown during bidding when the viewer was dealt a farmer's hand (all 9s and
 *  10s). Lets them throw the hand in for a full re-deal (same dealer deals again). */
export default function FarmerPanel({ onRedeal }: { onRedeal: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="bg-amber-900/30 border border-amber-400/40 rounded-xl p-3 text-sm text-amber-100 flex items-center justify-between gap-3 max-w-md flex-wrap">
      <span>
        🌾 <b>Farmer&rsquo;s hand!</b> All 9s &amp; 10s — you may throw it in for a fresh deal.
      </span>
      {confirming ? (
        <span className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRedeal}
            className="bg-amber-500 text-black font-medium rounded-lg px-3 py-1.5 hover:brightness-110 whitespace-nowrap"
          >
            Re-deal
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="bg-amber-500 text-black font-medium rounded-lg px-3 py-1.5 hover:brightness-110 whitespace-nowrap shrink-0"
        >
          Throw in…
        </button>
      )}
    </div>
  );
}
