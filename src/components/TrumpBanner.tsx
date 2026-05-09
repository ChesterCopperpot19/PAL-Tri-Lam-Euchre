'use client';
import { useEffect, useState } from 'react';
import type { Suit } from '@/server/engine/types';
import type { RoomMember } from '@/lib/shared-types';
import type { RedactedState } from '@/server/engine/redact';

const SUIT_NAME: Record<Suit, string> = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades',
};
const SUIT_GLYPH: Record<Suit, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
const SUIT_TINT: Record<Suit, { fg: string; bg: string; border: string }> = {
  H: { fg: '#fff', bg: 'linear-gradient(90deg,#7a0e1a 0%,#b21e2c 50%,#7a0e1a 100%)', border: '#ffd6dc' },
  D: { fg: '#fff', bg: 'linear-gradient(90deg,#7a0e1a 0%,#b21e2c 50%,#7a0e1a 100%)', border: '#ffd6dc' },
  C: { fg: '#fff', bg: 'linear-gradient(90deg,#0a0a0a 0%,#2c2c2c 50%,#0a0a0a 100%)', border: '#cfcfcf' },
  S: { fg: '#fff', bg: 'linear-gradient(90deg,#0a0a0a 0%,#2c2c2c 50%,#0a0a0a 100%)', border: '#cfcfcf' },
};

const EXPANDED_DURATION_MS = 1500;

/**
 * Trump banner. Big and prominent for the first 1.5s after trump is called
 * (a celebratory "trump is now Spades!" moment), then auto-collapses to a slim
 * chip so it doesn't compete with the felt for the rest of the hand.
 */
export default function TrumpBanner({
  state,
  members,
}: {
  state: RedactedState;
  members: RoomMember[];
}) {
  const trump = state.trump;
  // Component is remounted (via parent's key={trump}) whenever trump changes,
  // so we just start expanded and collapse after the celebration window.
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setExpanded(false), EXPANDED_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  if (!trump) return null;
  const tint = SUIT_TINT[trump];
  const maker = state.maker !== null ? members.find((m) => m.seat === state.maker) : null;

  if (!expanded) {
    // Slim chip — quiet, persistent reminder that doesn't crowd the felt.
    return (
      <div
        className="w-full px-3 py-1 flex items-center justify-center gap-2 text-xs sm:text-sm shadow"
        style={{
          background: tint.bg,
          color: tint.fg,
          borderTop: `1px solid ${tint.border}`,
          borderBottom: `1px solid ${tint.border}`,
        }}
      >
        <span className="uppercase tracking-[0.25em] opacity-80">Trump</span>
        <span aria-hidden>{SUIT_GLYPH[trump]}</span>
        <span className="font-medium">{SUIT_NAME[trump]}</span>
        {maker && (
          <>
            <span className="opacity-40">·</span>
            <span className="opacity-90">{maker.name}</span>
            {state.alone && <span className="italic opacity-80 ml-0.5">alone</span>}
          </>
        )}
      </div>
    );
  }

  // Expanded — only shown for the first 1.5s after trump is called.
  return (
    <div
      className="w-full px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-center gap-3 sm:gap-4 shadow-lg fade-in"
      style={{
        background: tint.bg,
        color: tint.fg,
        borderTop: `2px solid ${tint.border}`,
        borderBottom: `2px solid ${tint.border}`,
      }}
    >
      <div className="text-xs sm:text-sm uppercase tracking-[0.3em] opacity-80 hidden sm:block">
        Trump
      </div>
      <div
        className="font-display leading-none flex items-center gap-2 sm:gap-3"
        style={{ fontSize: 'clamp(28px, 6vw, 44px)' }}
      >
        <span aria-hidden>{SUIT_GLYPH[trump]}</span>
        <span className="tracking-wide">{SUIT_NAME[trump]}</span>
        <span aria-hidden>{SUIT_GLYPH[trump]}</span>
      </div>
      {maker && (
        <div className="text-xs sm:text-sm opacity-90 ml-1 sm:ml-3 whitespace-nowrap">
          Called by <span className="font-medium">{maker.name}</span>
          {state.alone && <span className="ml-1 italic">· alone</span>}
        </div>
      )}
    </div>
  );
}
