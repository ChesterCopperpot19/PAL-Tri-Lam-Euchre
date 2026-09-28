'use client';
import TrumpIndicator from './TrumpIndicator';
import type { Suit } from '@/server/engine/types';

/** The table's top bar: room code, scores, trump, sound, rules and leave. On
 *  phones the scores move to a second bar underneath. */
export default function TableHeader({
  code,
  isSpectator,
  nsName,
  ewName,
  scores,
  trump,
  soundOn,
  onToggleSound,
  onShowRules,
  onLeave,
}: {
  code: string;
  isSpectator: boolean;
  nsName: string;
  ewName: string;
  scores: { NS: number; EW: number };
  trump: Suit | null;
  soundOn: boolean;
  onToggleSound: () => void;
  onShowRules: () => void;
  onLeave: () => void;
}) {
  return (
    <>
      <header className="flex items-center justify-between px-3 sm:px-5 py-3 bg-black/40 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60">Room</div>
          <div className="font-display text-2xl text-gold tracking-widest">{code}</div>
          {isSpectator && (
            <span className="bg-violet-600/30 border border-violet-400/50 text-violet-200 text-xs uppercase tracking-wider px-2 py-0.5 rounded">
              👁 Spectator
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-black/55 border border-white/10 rounded-full px-3 py-1.5 text-sm">
            <span className="text-white/70 text-xs truncate max-w-[180px]" title={nsName}>{nsName}</span>
            <span className="font-display text-gold text-lg leading-none">{scores.NS}</span>
            <span className="text-white/30">·</span>
            <span className="text-white/70 text-xs truncate max-w-[180px]" title={ewName}>{ewName}</span>
            <span className="font-display text-gold text-lg leading-none">{scores.EW}</span>
          </div>
          <TrumpIndicator trump={trump} />
          <button
            onClick={onToggleSound}
            className="text-base leading-none hover:opacity-80"
            aria-label={soundOn ? 'Mute turn sound' : 'Unmute turn sound'}
            aria-pressed={soundOn}
            title={soundOn ? 'Turn sound on — tap to mute' : 'Turn sound off — tap to unmute'}
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
          <button
            onClick={onShowRules}
            className="text-xs text-white/60 hover:text-white"
            title="Show the house rules"
            aria-label="Show the house rules"
          >
            📖<span className="hidden sm:inline"> Rules</span>
          </button>
          <button
            onClick={onLeave}
            className="text-xs text-white/60 hover:text-white"
          >
            Leave
          </button>
        </div>
      </header>
      <div className="sm:hidden flex items-center justify-center gap-2 py-1.5 px-2 bg-black/35 border-b border-white/10 text-sm flex-wrap">
        <span className="text-white/70 text-xs truncate max-w-[40%]" title={nsName}>{nsName}</span>
        <span className="font-display text-gold text-lg leading-none">{scores.NS}</span>
        <span className="text-white/30">·</span>
        <span className="text-white/70 text-xs truncate max-w-[40%]" title={ewName}>{ewName}</span>
        <span className="font-display text-gold text-lg leading-none">{scores.EW}</span>
      </div>
    </>
  );
}
