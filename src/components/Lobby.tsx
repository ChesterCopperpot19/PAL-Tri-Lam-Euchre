'use client';
import type { RoomMember, RoomSnapshot } from '@/lib/shared-types';

const SEAT_LABEL = ['South (you)', 'West', 'North', 'East'] as const;
const SEAT_TEAM = ['N/S', 'E/W', 'N/S', 'E/W'] as const;

export default function Lobby({
  snapshot,
  myId,
  onStart,
  onPromote,
  onAddBot,
  onFillBots,
  onRemoveBot,
  onMoveSeat,
}: {
  snapshot: RoomSnapshot;
  myId: string;
  onStart: () => void;
  onPromote: (playerId: string, seat: 0 | 1 | 2 | 3) => void;
  onAddBot: (seat: 0 | 1 | 2 | 3) => void;
  onFillBots: () => void;
  onRemoveBot: (seat: 0 | 1 | 2 | 3) => void;
  onMoveSeat: (seat: 0 | 1 | 2 | 3) => void;
}) {
  const isHost = snapshot.hostPlayerId === myId;
  const meSeat = snapshot.members.find((m) => m.playerId === myId)?.seat ?? null;

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
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-white/60">Room</div>
        <h2 className="font-display text-5xl tracking-widest text-gold">{snapshot.code}</h2>
        <p className="text-white/70 text-sm mt-2">
          Share this code with friends, or send the link:{' '}
          <code className="bg-black/40 px-1.5 py-0.5 rounded">
            {typeof window !== 'undefined' ? window.location.origin : ''}/?code={snapshot.code}
          </code>
        </p>
      </div>

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
                        className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                          m.connected ? 'bg-gold' : 'bg-red-400'
                        }`}
                      />
                      {m.name}
                      {isMe && <span className="text-gold text-xs ml-1">(you)</span>}
                    </>
                  ) : (
                    <span className="text-white/40 italic">empty</span>
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
                      className="text-[10px] uppercase tracking-wider bg-pitt-blue hover:bg-[#1f4ea3] rounded px-1.5 py-0.5"
                    >
                      + Bot
                    </button>
                  )}
                  {!m && isHost && spectators.length > 0 && (
                    <select
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
            className="text-xs uppercase tracking-wider bg-pitt-blue hover:bg-[#1f4ea3] text-white rounded-lg px-3 py-2"
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
          disabled={!isHost || !snapshot.full}
          className="bg-gold text-black font-semibold rounded-lg px-6 py-3 hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
          title={!isHost ? 'Host only' : !snapshot.full ? 'Need 4 seated players' : ''}
        >
          {snapshot.full ? 'Start Game' : `Waiting for players (${4 - snapshot.members.filter((m) => m.seat !== null).length} more)`}
        </button>
      </div>
    </div>
  );
}
