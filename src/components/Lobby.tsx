'use client';
import { useEffect, useRef, useState } from 'react';
import type { RoomMember, RoomSnapshot } from '@/lib/shared-types';
import { useModal } from '@/lib/useModal';

const SEAT_LABEL = ['South (you)', 'West', 'North', 'East'] as const;
const SEAT_TEAM = ['N/S', 'E/W', 'N/S', 'E/W'] as const;

/** "Quit this game?" confirmation. Its own component so the modal hook mounts
 *  and unmounts with the dialog (focus trap on, focus restored on close). */
function QuitDialog({ onStay, onQuit }: { onStay: () => void; onQuit: () => void }) {
  const stayRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModal(onStay, { initialFocus: stayRef });
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Quit this game?"
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
    >
      <div className="bg-[#141B4D] border border-gold/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
        <div className="font-display text-2xl text-gold">Quit this game?</div>
        <p className="text-sm text-white/75">
          You&apos;ll leave this room right away. If you&apos;re the last person here,
          the room closes and any bots are removed.
        </p>
        <div className="flex gap-2">
          <button
            ref={stayRef}
            onClick={onStay}
            className="flex-1 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg py-2.5 font-medium"
          >
            Stay
          </button>
          <button
            onClick={onQuit}
            className="flex-1 bg-gold text-black font-semibold rounded-lg py-2.5 hover:brightness-110"
          >
            Quit game
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Lobby({
  snapshot,
  myId,
  onStart,
  onPromote,
  onAddBot,
  onFillBots,
  onRemoveBot,
  onMoveSeat,
  onLeave,
}: {
  snapshot: RoomSnapshot;
  myId: string;
  onStart: () => void;
  onPromote: (playerId: string, seat: 0 | 1 | 2 | 3) => void;
  onAddBot: (seat: 0 | 1 | 2 | 3) => void;
  onFillBots: () => void;
  onRemoveBot: (seat: 0 | 1 | 2 | 3) => void;
  onMoveSeat: (seat: 0 | 1 | 2 | 3) => void;
  onLeave: () => void;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Read in an effect, not during render, so server and client markup match.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const isHost = snapshot.hostPlayerId === myId;
  const meSeat = snapshot.members.find((m) => m.playerId === myId)?.seat ?? null;
  // Any seated player can start once the table is full — not just the host.
  const seatedCount = snapshot.members.filter((m) => m.seat !== null).length;
  const canStart = meSeat !== null && snapshot.full;
  const startBlockedReason =
    meSeat === null
      ? 'Spectating — a seated player starts the game'
      : !snapshot.full
        ? `Waiting for players (${4 - seatedCount} more)`
        : '';

  function seatMember(i: 0 | 1 | 2 | 3): RoomMember | undefined {
    return snapshot.members.find((m) => m.seat === i);
  }

  const spectators = snapshot.members.filter((m) => m.seat === null);

  // Re-label seats relative to viewer (so viewer's seat shows "you").
  const seatLabel = (i: 0 | 1 | 2 | 3) => {
    if (meSeat === null) return SEAT_LABEL[i];
    const diff = ((i - meSeat + 4) % 4) as 0 | 1 | 2 | 3;
    return ['South (you)', 'West', 'North (partner)', 'East'][diff];
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setConfirmLeave(true)}
          className="text-xs text-white/60 hover:text-white border border-white/15 rounded-lg px-3 py-1.5"
        >
          Leave game
        </button>
      </div>

      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-white/60">Room</div>
        <h2 className="font-display text-5xl tracking-widest text-gold">{snapshot.code}</h2>
        <p className="text-white/70 text-sm mt-2">
          Share this code with friends, or send the link:{' '}
          <code className="bg-black/40 px-1.5 py-0.5 rounded">
            {origin}/?code={snapshot.code}
          </code>
        </p>
      </div>

      {confirmLeave && (
        <QuitDialog onStay={() => setConfirmLeave(false)} onQuit={onLeave} />
      )}

      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => {
          const m = seatMember(i as 0 | 1 | 2 | 3);
          const isMe = m?.playerId === myId;
          return (
            <div
              key={i}
              className={`rounded-xl p-3 border ${
                isMe ? 'border-gold bg-gold/10' : 'border-white/10 bg-black/45'
              }`}
            >
              <div className="text-xs uppercase tracking-wider text-white/60">
                Seat · {SEAT_TEAM[i]}
              </div>
              <div className="text-white/90 mt-0.5 text-sm">{seatLabel(i as 0 | 1 | 2 | 3)}</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="font-medium">
                  {m ? (
                    <>
                      <span
                        aria-hidden="true"
                        title={m.connected ? 'Connected' : 'Disconnected'}
                        className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                          m.connected ? 'bg-gold' : 'bg-red-400'
                        }`}
                      />
                      <span className="sr-only">
                        {m.connected ? 'connected' : 'disconnected'}
                      </span>
                      {m.name}
                      {isMe && <span className="text-gold text-xs ml-1">(you)</span>}
                      {/* Name the host: they still gate the bot / seat-spectator
                          controls, so a silent host is a confusing host. */}
                      {m.playerId === snapshot.hostPlayerId && (
                        <span
                          className="text-white/55 text-xs ml-1"
                          title="The host can add or remove bots and seat spectators"
                        >
                          (host)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-white/60 italic">empty</span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {m?.isBot && isHost && (
                    <button
                      onClick={() => onRemoveBot(i as 0 | 1 | 2 | 3)}
                      className="text-[10px] uppercase tracking-wider text-white/60 hover:text-red-300 border border-white/15 rounded px-1.5 py-0.5"
                    >
                      Remove
                    </button>
                  )}
                  {!m && meSeat !== null && meSeat !== i && (
                    <button
                      onClick={() => onMoveSeat(i as 0 | 1 | 2 | 3)}
                      className="text-[10px] uppercase tracking-wider bg-gold/90 hover:bg-gold text-black rounded px-1.5 py-0.5"
                      title="Move yourself to this seat"
                    >
                      Sit here
                    </button>
                  )}
                  {!m && isHost && (
                    <button
                      onClick={() => onAddBot(i as 0 | 1 | 2 | 3)}
                      className="text-[10px] uppercase tracking-wider bg-pitt-blueDk hover:bg-[#22306e] rounded px-1.5 py-0.5"
                    >
                      + Bot
                    </button>
                  )}
                  {!m && isHost && spectators.length > 0 && (
                    <select
                      aria-label="Seat a spectator here"
                      onChange={(e) => {
                        if (e.target.value) onPromote(e.target.value, i as 0 | 1 | 2 | 3);
                      }}
                      className="text-xs bg-black/40 border border-white/15 rounded px-1 py-0.5"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Seat spectator…
                      </option>
                      {spectators.map((s) => (
                        <option key={s.playerId} value={s.playerId}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isHost && !snapshot.full && (
        <div className="flex justify-center">
          <button
            onClick={onFillBots}
            className="text-xs uppercase tracking-wider bg-pitt-blueDk hover:bg-[#22306e] text-white rounded-lg px-3 py-2"
          >
            Fill empty seats with bots
          </button>
        </div>
      )}

      {spectators.length > 0 && (
        <div className="bg-black/35 border border-white/10 rounded-xl p-3">
          <div className="text-xs uppercase tracking-wider text-white/60 mb-1">
            👁 Spectators ({spectators.length})
          </div>
          <div className="text-sm text-white/80 flex flex-wrap gap-x-3 gap-y-1">
            {spectators.map((s) => (
              <span key={s.playerId}>{s.name}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={onStart}
          disabled={!canStart}
          className="bg-gold text-black font-semibold rounded-lg px-6 py-3 hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title={startBlockedReason}
        >
          {/* Say why the button is dead in the label itself. It used to explain
              itself only through `title`, which never shows up on touch. */}
          {canStart ? 'Start Game' : startBlockedReason}
        </button>
      </div>
    </div>
  );
}
