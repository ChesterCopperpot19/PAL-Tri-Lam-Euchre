'use client';
import { POINTS_TO_WIN } from '@/server/engine/types';
import type { RedactedState } from '@/server/engine/redact';
import type { RoomMember } from '@/lib/shared-types';
import { teamName } from '@/lib/format';

export default function ScoreBoard({
  state,
  members,
}: {
  state: RedactedState;
  members: RoomMember[];
}) {
  const ns = teamName(members, 'NS');
  const ew = teamName(members, 'EW');
  return (
    <div className="bg-black/55 border border-white/10 rounded-xl p-3 shadow-lg text-sm w-56 max-w-full">
      <div className="text-xs uppercase tracking-wider text-white/60 mb-1">Score</div>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
        <div className="text-white/85 truncate" title={ns}>
          {ns}
        </div>
        <div className="text-right font-display text-xl text-gold">{state.scores.NS}</div>
        <div className="text-white/85 truncate" title={ew}>
          {ew}
        </div>
        <div className="text-right font-display text-xl text-gold">{state.scores.EW}</div>
      </div>
      <div className="mt-2 text-xs text-white/50">First to {POINTS_TO_WIN}</div>
      <div className="mt-2 text-xs text-white/70 uppercase tracking-wider">
        Tricks (this hand)
      </div>
      <div className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
        <div className="truncate" title={ns}>
          {ns}
        </div>
        <div className="text-right">{state.trickCounts.NS}</div>
        <div className="truncate" title={ew}>
          {ew}
        </div>
        <div className="text-right">{state.trickCounts.EW}</div>
      </div>
    </div>
  );
}
