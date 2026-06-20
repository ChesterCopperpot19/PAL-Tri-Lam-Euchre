'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDisplayName, usePlayerId } from '@/lib/usePlayerId';
import { getSocket } from '@/lib/socket-client';
import PlayerNameSelect from '@/components/PlayerNameSelect';
import type { RoomListEntry } from '@/lib/shared-types';

const PHASE_LABEL: Record<string, string> = {
  LOBBY: 'Lobby',
  BIDDING_1: 'Bidding',
  BIDDING_2: 'Bidding',
  DEALER_DISCARD: 'Bidding',
  PLAYING: 'In play',
  HAND_END: 'Between hands',
  GAME_OVER: 'Finishing',
};

export default function LandingPage() {
  const router = useRouter();
  const playerId = usePlayerId();
  const [name, setName] = useDisplayName();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomListEntry[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const c = url.searchParams.get('code');
      if (c) setCode(c.toUpperCase());
    }
  }, []);

  // Poll for in-progress rooms every 2 seconds so the landing page stays current.
  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;
    const refresh = () =>
      socket.emit('rooms:list', (list) => {
        if (!cancelled) setRooms(list);
      });
    refresh();
    const id = setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function go(asSpectator: boolean, joinCode: string | null) {
    if (!playerId) return;
    if (!name.trim()) {
      setError('Please enter a display name.');
      return;
    }
    setBusy(true);
    setError(null);
    const socket = getSocket();
    socket.emit(
      'room:join',
      {
        code: (joinCode || '').toUpperCase().trim(),
        name: name.trim(),
        playerId,
        asSpectator,
      },
      (res) => {
        setBusy(false);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const c = res.snapshot.code;
        const role = asSpectator ? 'spectate' : 'play';
        router.push(`/room/${c}?role=${role}`);
      }
    );
  }

  function joinListed(roomCode: string, asSpectator: boolean) {
    go(asSpectator, roomCode);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10 gap-6">
      <div className="w-full max-w-md bg-black/40 border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur shadow-2xl">
        <div className="text-[11px] uppercase tracking-[0.35em] text-white/50">
          Welcome to the
        </div>
        <h1 className="font-display text-3xl sm:text-4xl text-gold tracking-wide mb-6 leading-tight">
          PAL/Tri-Lam Euchre Club
        </h1>

        <label className="block mb-4">
          <span className="text-sm text-white/80">Your name</span>
          <PlayerNameSelect
            value={name}
            onChange={setName}
            placeholder="Select your name…"
            className="mt-1"
          />
        </label>

        <button
          disabled={busy}
          onClick={() => go(false, null)}
          className="w-full bg-gold text-black font-semibold rounded-lg py-2.5 mb-3 hover:brightness-110 transition disabled:opacity-50"
        >
          Create New Game
        </button>

        <div className="text-center text-white/40 text-xs my-2">— or join an existing room —</div>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            maxLength={6}
            placeholder="ROOM CODE"
            className="flex-1 bg-black/40 border border-white/15 rounded-lg px-3 py-2.5 tracking-[0.3em] uppercase outline-none focus:border-gold focus-visible:ring-2 focus-visible:ring-gold/50"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            disabled={busy || code.length < 4}
            onClick={() => go(false, code)}
            className="bg-pitt-blue hover:bg-[#1f4ea3] rounded-lg py-2.5 font-medium disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:outline-none"
          >
            Join as Player
          </button>
          <button
            disabled={busy || code.length < 4}
            onClick={() => go(true, code)}
            className="bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg py-2.5 font-medium disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:outline-none"
            title="Watch only — you cannot see anyone's hand"
          >
            👁 Spectate
          </button>
        </div>

        {error && <div className="mt-4 text-red-300 text-sm">{error}</div>}

        <Link
          href="/stats"
          className="mt-4 block text-center text-sm bg-white/5 hover:bg-white/10 border border-white/15 rounded-lg py-2.5 font-medium text-gold"
        >
          📊 All-time stats
        </Link>

        <details className="mt-6 text-sm text-white/70">
          <summary className="cursor-pointer hover:text-white">House rules</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-white/60">
            <li>24-card deck (9–A); fixed partnerships N/S vs E/W.</li>
            <li>Two bidding rounds; <em>stick the dealer</em> on round 2.</li>
            <li>Left bower = jack of same color as trump (second-highest trump).</li>
            <li>1 point for 3–4 tricks, 2 for a march, 4 for a lone march.</li>
            <li>Euchre = 2 points to defenders. First to 10 wins.</li>
            <li>Spectators see no hands — pure cheat-proof viewing.</li>
          </ul>
        </details>
      </div>

      {rooms.length > 0 && (
        <div className="w-full max-w-md bg-black/30 border border-white/10 rounded-2xl p-4 sm:p-6 backdrop-blur shadow-xl">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/60 mb-2">
            Games in progress
          </div>
          <div className="space-y-2">
            {rooms.map((r) => {
              const playerNames = r.members
                .filter((m) => m.seat !== null)
                .map((m) => m.name);
              const canJoin = !r.full && r.phase === 'LOBBY';
              return (
                <div
                  key={r.code}
                  className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-lg px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-display text-gold tracking-widest">
                        {r.code}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider bg-white/10 text-white/80 rounded px-1.5 py-0.5">
                        {PHASE_LABEL[r.phase] ?? r.phase}
                      </span>
                      <span className="text-xs text-white/60">
                        {r.seatedCount}/4
                        {r.spectatorCount > 0 && ` · 👁 ${r.spectatorCount}`}
                      </span>
                    </div>
                    <div className="text-xs text-white/70 truncate mt-0.5">
                      {playerNames.length ? playerNames.join(', ') : 'No players yet'}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {canJoin && (
                      <button
                        disabled={busy || !name.trim()}
                        onClick={() => joinListed(r.code, false)}
                        className="text-xs bg-pitt-blue hover:bg-[#1f4ea3] rounded-md px-2.5 py-1.5 font-medium disabled:opacity-40"
                        title={!name.trim() ? 'Enter a name first' : 'Join this game'}
                      >
                        Join
                      </button>
                    )}
                    <button
                      disabled={busy || !name.trim()}
                      onClick={() => joinListed(r.code, true)}
                      className="text-xs bg-white/10 hover:bg-white/20 border border-white/15 rounded-md px-2.5 py-1.5 font-medium disabled:opacity-40"
                      title={!name.trim() ? 'Enter a name first' : 'Watch this game'}
                    >
                      👁 Watch
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
