'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDisplayName, usePlayerId } from '@/lib/usePlayerId';
import { getSocket } from '@/lib/socket-client';

export default function LandingPage() {
  const router = useRouter();
  const playerId = usePlayerId();
  const [name, setName] = useDisplayName();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const c = url.searchParams.get('code');
      if (c) setCode(c.toUpperCase());
    }
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

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-black/40 border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur shadow-2xl">
        <div className="text-[11px] uppercase tracking-[0.35em] text-white/50">
          Welcome to the
        </div>
        <h1 className="font-display text-3xl sm:text-4xl text-gold tracking-wide mb-1 leading-tight">
          PAL/Tri-Lam Euchre Club
        </h1>
        <p className="text-white/70 mb-6 text-sm sm:text-base">
          Four players, two teams, ten points. Bid sharp, lead bold.
        </p>

        <label className="block mb-4">
          <span className="text-sm text-white/80">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Alex"
            className="mt-1 w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2.5 outline-none focus:border-gold focus-visible:ring-2 focus-visible:ring-gold/50"
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
    </main>
  );
}
