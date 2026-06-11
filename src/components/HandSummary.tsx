'use client';
import { useEffect, useRef, useState } from 'react';
import { SuitGlyph } from './Card';
import type { HandSummary as HS, SeatIndex } from '@/server/engine/types';
import { TEAM_OF } from '@/server/engine/types';
import type { RoomMember } from '@/lib/shared-types';
import { teamName } from '@/lib/format';

const SEAT_NAME = ['South', 'West', 'North', 'East'] as const;

export default function HandSummary({
  summary,
  members,
  myId,
}: {
  summary: HS;
  members: RoomMember[];
  myId: string;
}) {
  // Countdown until the server auto-advances to the next hand.
  const [secondsLeft, setSecondsLeft] = useState(6);
  useEffect(() => {
    setSecondsLeft(6);
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [summary]);

  // Move focus into the dialog so screen readers announce the result.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  const makerName =
    members.find((m) => m.seat === summary.maker)?.name ?? SEAT_NAME[summary.maker];

  // Winning team = makers if they took 3+, else defenders.
  const makerTeam = TEAM_OF[summary.maker];
  const winnerTeam = summary.euchred ? (makerTeam === 'NS' ? 'EW' : 'NS') : makerTeam;
  const winnerSeats: SeatIndex[] = winnerTeam === 'NS' ? [0, 2] : [1, 3];

  // If maker went alone and won, only the lone player "won" — partner sat out.
  const aloneWin = !summary.euchred && summary.alone;
  const winnerMembers = aloneWin
    ? [members.find((m) => m.seat === summary.maker)]
    : winnerSeats.map((s) => members.find((m) => m.seat === s));

  const winnerNames = winnerMembers
    .map((m, i) => m?.name ?? SEAT_NAME[(aloneWin ? summary.maker : winnerSeats[i]) as SeatIndex])
    .filter(Boolean);

  // Did the viewer win?
  const me = members.find((m) => m.playerId === myId);
  const myTeam = me && me.seat !== null ? TEAM_OF[me.seat as SeatIndex] : null;
  const youWon = myTeam === winnerTeam;

  const winnerTeamName = teamName(members, winnerTeam);
  const headline = winnerNames.join(' & ') + ' won';
  const sublineParts: string[] = [];
  if (summary.euchred) sublineParts.push('Euchre!');
  if (summary.march) sublineParts.push(summary.alone ? 'Lone march' : 'March');
  if (!summary.euchred && !summary.march) sublineParts.push('Hand');
  const points = summary.pointsAwarded[winnerTeam];
  sublineParts.push(`+${points} for ${winnerTeamName}`);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Hand complete — ${headline}`}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-[#00133d] border border-gold/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-3 outline-none"
      >
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-white/60">Hand complete</div>
          <h3 className="font-display text-2xl sm:text-3xl text-gold leading-tight mt-1 break-words">
            {headline}
          </h3>
          <div className="text-sm text-white/80 mt-1">{sublineParts.join(' · ')}</div>
          {me?.seat !== null && me?.seat !== undefined && (
            <div
              className={`mt-2 inline-block text-[11px] uppercase tracking-wider rounded px-2 py-0.5 ${
                youWon ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40' : 'bg-white/5 text-white/60 border border-white/15'
              }`}
            >
              {youWon ? 'You won this hand' : 'You lost this hand'}
            </div>
          )}
        </div>

        <div className="bg-black/40 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-white/70">Maker</span>
            <span>
              {makerName}{' '}
              {summary.alone && <span className="text-violet-300">· alone</span>}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/70">Trump</span>
            <span>
              <SuitGlyph suit={summary.trump} size={18} />
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-white/70">Tricks</span>
            <span className="text-right truncate">
              <span className="text-white/85" title={teamName(members, 'NS')}>
                {teamName(members, 'NS')}
              </span>{' '}
              <span className="text-white/95 font-medium">{summary.tricksByTeam.NS}</span>
              <span className="text-white/40"> · </span>
              <span className="text-white/85" title={teamName(members, 'EW')}>
                {teamName(members, 'EW')}
              </span>{' '}
              <span className="text-white/95 font-medium">{summary.tricksByTeam.EW}</span>
            </span>
          </div>
          <div className="flex justify-between gap-3 font-medium">
            <span className="text-white/90">Points awarded</span>
            <span className="text-gold text-right">
              {teamName(members, 'NS')} +{summary.pointsAwarded.NS}
              <span className="text-white/40"> · </span>
              {teamName(members, 'EW')} +{summary.pointsAwarded.EW}
            </span>
          </div>
        </div>

        <div className="text-center text-sm text-white/70 py-2">
          Next hand in{' '}
          <span className="font-display text-gold text-lg">{secondsLeft}</span>…
        </div>
      </div>
    </div>
  );
}
