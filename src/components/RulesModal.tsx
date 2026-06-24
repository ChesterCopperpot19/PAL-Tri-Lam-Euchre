'use client';
import { useEffect } from 'react';

function Rule({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-gold/90 font-semibold text-[11px] uppercase tracking-wider">{t}</div>
      <div className="text-white/80">{children}</div>
    </div>
  );
}

/** The house rules currently enforced by the game — readable mid-game so players
 *  can settle "which rules are we using?" questions on the spot. */
export default function RulesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="House rules"
      className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center px-3 py-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#141B4D] border border-gold/60 rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl my-auto max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-2xl text-gold">House Rules</h2>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-sm bg-white/10 border border-white/15 rounded-lg px-3 py-1"
          >
            Close ✕
          </button>
        </div>
        <div className="space-y-3 text-sm leading-relaxed">
          <Rule t="The game">
            Four players, two partnerships (North–South vs. East–West). First team to <b>10 points</b> wins.
          </Rule>
          <Rule t="The deck">
            24 cards — 9, 10, J, Q, K, A in each suit. Everyone is dealt 5; the top of the kitty is turned face-up.
          </Rule>
          <Rule t="Trump &amp; bowers">
            The <b>right bower</b> (Jack of trump) is the highest card; the <b>left bower</b> (Jack of the same
            color) is next highest and plays as trump.
          </Rule>
          <Rule t="Bidding — round 1">
            In turn, each player may tell the dealer to <b>pick it up</b> — making the up-card&rsquo;s suit trump
            (the dealer takes it and discards one) — or <b>pass</b>.
          </Rule>
          <Rule t="Bidding — round 2">
            If everyone passes, players may <b>name a different suit</b> as trump (not the turned-down suit) or pass.
          </Rule>
          <Rule t="Stick the dealer">
            If it comes back around in round 2, the <b>dealer must call</b> a suit — they cannot pass.
          </Rule>
          <Rule t="Going alone">
            The maker may <b>go alone</b>; their partner sits out the hand.
          </Rule>
          <Rule t="Scoring">
            Maker takes 3–4 tricks = <b>1 point</b>. All 5 tricks (a march) = <b>2</b>. A <b>lone march</b> (all 5,
            alone) = <b>4</b>. If the maker fails to take 3 (euchred), the defenders score <b>2</b>.
          </Rule>
          <Rule t="Farmer&rsquo;s hand">
            A player dealt a farmer&rsquo;s hand — <b>all 9s and 10s</b> (no card higher than a 10) — may, before
            bidding, <b>swap three of their cards</b> for the three buried kitty cards.
          </Rule>
        </div>
      </div>
    </div>
  );
}
