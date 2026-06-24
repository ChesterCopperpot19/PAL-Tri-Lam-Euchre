'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getSocket } from '@/lib/socket-client';
import { useDisplayName, usePlayerId } from '@/lib/usePlayerId';
import type { ChatMessage, RoomSnapshot } from '@/lib/shared-types';
import Lobby from '@/components/Lobby';
import Table from '@/components/Table';
import type { Suit } from '@/server/engine/types';

const SUIT_NAMES: Record<string, string> = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades',
};

/** Human-readable toast for a server game event, or null to stay silent.
 *  Noisy events (every card played, every trick) are deliberately skipped —
 *  those are already visible on the felt. */
function eventText(ev: string, snap: RoomSnapshot | null): string | null {
  const parts = ev.split(':');
  const nameOf = (seatStr: string) =>
    snap?.members.find((m) => m.seat === Number(seatStr))?.name ?? 'Someone';
  const alone = parts[3] === 'alone' ? ' — going ALONE 🔥' : '';
  switch (parts[0]) {
    case 'bid_order':
      return `${nameOf(parts[1])} told the dealer to pick it up — trump is ${
        SUIT_NAMES[parts[2]] ?? parts[2]
      }${alone}`;
    case 'bid_call':
      return `${nameOf(parts[1])} called ${SUIT_NAMES[parts[2]] ?? parts[2]}${alone}`;
    case 'farmers_redeal':
      return `${nameOf(parts[1])} threw in a farmer's hand — re-dealing`;
    case 'bid_round1_all_passed':
      return 'Everyone passed — round two: call any other suit';
    case 'rematch':
      return 'Rematch! Back to the lobby.';
    default:
      return null;
  }
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code || '').toString().toUpperCase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get('role') || 'play';
  const playerId = usePlayerId();
  const [name] = useDisplayName();

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [joining, setJoining] = useState(true);
  const [joinFailed, setJoinFailed] = useState<string | null>(null);
  const joinedRef = useRef(false);
  // Latest snapshot for event handlers registered once (avoids stale closures).
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const toastIdRef = useRef(0);
  // The "going alone" gag: a full-screen photo for 7s whenever a loner is called.
  const [lonerFx, setLonerFx] = useState(false);
  const [lonerCaller, setLonerCaller] = useState<string | null>(null);
  const lonerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playerId) return;
    if (joinedRef.current) return;
    joinedRef.current = true;

    const socket = getSocket();

    function onSnap(s: RoomSnapshot) {
      snapshotRef.current = s;
      setSnapshot(s);
    }

    function onEvent(ev: string) {
      // A loner call (order-up or suit-call, going alone) fires the 7-second
      // full-screen "going alone" photo for everyone in the room — bots
      // included, since every bid flows through this same room:event.
      const p = ev.split(':');
      if ((p[0] === 'bid_order' || p[0] === 'bid_call') && p[3] === 'alone') {
        const caller = snapshotRef.current?.members.find((m) => m.seat === Number(p[1]))?.name ?? null;
        setLonerCaller(caller);
        setLonerFx(true);
        if (lonerTimerRef.current) clearTimeout(lonerTimerRef.current);
        lonerTimerRef.current = setTimeout(() => setLonerFx(false), 7000);
      }

      const text = eventText(ev, snapshotRef.current);
      if (!text) return;
      const id = ++toastIdRef.current;
      setToasts((cur) => [...cur.slice(-2), { id, text }]);
      setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== id));
      }, 4000);
    }
    function onErr(msg: string) {
      setErrorBanner(msg);
      setTimeout(() => setErrorBanner((cur) => (cur === msg ? null : cur)), 4000);
    }
    function onMsg(m: ChatMessage) {
      // Dedupe by id — the server replays the full chat log on every (re)join,
      // so without this, reconnects would repeat every message.
      setChat((cur) => {
        if (cur.some((c) => c.id === m.id)) return cur;
        return [...cur, m].slice(-200);
      });
    }

    // Join (or re-join) the room. Called once on mount AND every time the socket
    // reconnects — fixes mobile background-tab disconnects, where the host
    // wouldn't see a new player join until refresh.
    function joinRoom(isReconnect: boolean) {
      socket.emit(
        'room:join',
        {
          code,
          name: name || 'Player',
          playerId: playerId!,
          asSpectator: role === 'spectate',
        },
        (res) => {
          if (!isReconnect) setJoining(false);
          if (!res.ok) {
            if (!isReconnect) setJoinFailed(res.error);
            return;
          }
          snapshotRef.current = res.snapshot;
          setSnapshot(res.snapshot);
        }
      );
    }

    // Named handler so cleanup removes only ours, not every 'connect' listener.
    function onConnect() {
      joinRoom(true);
    }

    socket.on('room:snapshot', onSnap);
    socket.on('room:error', onErr);
    socket.on('chat:msg', onMsg);
    socket.on('room:event', onEvent);
    socket.on('connect', onConnect);

    joinRoom(false);

    // When the tab becomes visible again (mobile lock/unlock, app switch),
    // refresh the snapshot in case we missed any events while backgrounded.
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        if (!socket.connected) socket.connect();
        else joinRoom(true);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      socket.off('room:snapshot', onSnap);
      socket.off('room:error', onErr);
      socket.off('chat:msg', onMsg);
      socket.off('room:event', onEvent);
      socket.off('connect', onConnect);
      document.removeEventListener('visibilitychange', onVisibility);
      if (lonerTimerRef.current) clearTimeout(lonerTimerRef.current);
    };
  }, [code, playerId, name, role]);

  if (joinFailed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="bg-black/50 border border-red-400/40 rounded-xl p-6 max-w-md text-center">
          <div className="text-red-300 font-medium">Couldn't join room</div>
          <div className="text-white/70 text-sm mt-1">{joinFailed}</div>
          <button
            onClick={() => router.push('/')}
            className="mt-4 bg-gold text-black px-4 py-2 rounded-lg font-medium"
          >
            Back to home
          </button>
        </div>
      </main>
    );
  }

  if (joining || !snapshot || !playerId) {
    return (
      <main className="min-h-screen flex items-center justify-center text-white/60">
        Connecting…
      </main>
    );
  }

  const socket = getSocket();
  const handlers = {
    onOrder: (alone: boolean) => socket.emit('bid:order', { alone }),
    onPass: () => socket.emit('bid:pass'),
    onCall: (suit: Suit, alone: boolean) => socket.emit('bid:call', { suit, alone }),
    onDiscard: (cardId: string) => socket.emit('discard:card', { cardId }),
    onFarmersRedeal: () => socket.emit('farmers:redeal'),
    onPlay: (cardId: string) => socket.emit('play:card', { cardId }),
    onChat: (text: string) => socket.emit('chat:send', { text }),
    onNextHand: () => socket.emit('room:nextHand'),
    onRematch: () => socket.emit('room:rematch'),
    onLeave: () => {
      // Tell the server we're intentionally leaving so it cleans the room up
      // immediately (no 60s grace, and bot-only rooms get deleted). The server
      // disconnects us after processing, so we just emit then navigate — letting
      // the emit flush instead of racing it with a client-side disconnect.
      socket.emit('room:leave');
      router.push('/');
    },
  };

  return (
    <>
      {/* "Going alone" gag — full-screen photo for 7 seconds on any loner call. */}
      {lonerFx && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 px-3 fade-in"
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/loner.jpg"
            alt=""
            className="max-h-[82vh] max-w-[94vw] rounded-xl border-2 border-gold object-contain shadow-2xl"
          />
          <div className="mt-4 font-display text-3xl sm:text-4xl uppercase tracking-[0.15em] text-gold drop-shadow text-center">
            {lonerCaller ? `${lonerCaller} is going alone!` : 'Going Alone'}
          </div>
        </div>
      )}

      {errorBanner && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white text-sm px-3 py-1.5 rounded-md shadow-lg">
          {errorBanner}
        </div>
      )}

      {/* Game-event toasts ("Maggie called Hearts", "Rematch!") */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed top-12 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5 pointer-events-none px-3 w-full max-w-md"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="bg-black/85 border border-gold/50 text-white text-sm px-3 py-1.5 rounded-lg shadow-lg fade-in text-center"
            >
              {t.text}
            </div>
          ))}
        </div>
      )}

      {snapshot.state.phase === 'LOBBY' ? (
        <Lobby
          snapshot={snapshot}
          myId={playerId}
          onStart={() => socket.emit('room:start')}
          onPromote={(pid, seat) => socket.emit('room:promote', { playerId: pid, seat })}
          onAddBot={(seat) => socket.emit('room:addBot', { seat })}
          onFillBots={() => socket.emit('room:fillBots')}
          onRemoveBot={(seat) => socket.emit('room:removeBot', { seat })}
          onMoveSeat={(seat) => socket.emit('room:moveSeat', { seat })}
          onLeave={handlers.onLeave}
        />
      ) : (
        <Table snapshot={snapshot} myId={playerId} chat={chat} handlers={handlers} />
      )}
    </>
  );
}
