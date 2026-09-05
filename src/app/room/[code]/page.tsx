'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getSocket } from '@/lib/socket-client';
import { readRoomToken, storeRoomToken } from '@/lib/room-token';
import { useDisplayName, usePlayerId } from '@/lib/usePlayerId';
import { SUIT_NAME } from '@/lib/suits';
import type { ChatMessage, RoomSnapshot } from '@/lib/shared-types';
import Lobby from '@/components/Lobby';
import Table, { type Handlers } from '@/components/Table';
import type { Suit } from '@/server/engine/types';

/** Suit name for a raw event token (falls back to the token if it isn't a suit). */
const suitName = (s: string) => (SUIT_NAME as Record<string, string>)[s] ?? s;


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
      return `${nameOf(parts[1])} told the dealer to pick it up — trump is ${suitName(
        parts[2]
      )}${alone}`;
    case 'bid_call':
      return `${nameOf(parts[1])} called ${suitName(parts[2])}${alone}`;
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

function Connecting() {
  return (
    <main className="min-h-screen flex items-center justify-center text-white/60">
      Connecting…
    </main>
  );
}

/** useSearchParams() opts the route out of static rendering unless it sits
 *  under a Suspense boundary — hence the inner/outer split. */
export default function RoomPage() {
  return (
    <Suspense fallback={<Connecting />}>
      <RoomPageInner />
    </Suspense>
  );
}

function RoomPageInner() {
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
  // Guards against the effect body running twice for one mount.
  const listenersBoundRef = useRef(false);
  // True once the FIRST room:join has been acked ok. Until then a 'connect'
  // event is the initial join (cold load), not a rejoin.
  const hasJoinedRef = useRef(false);
  // Latest snapshot for event handlers registered once (avoids stale closures).
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const toastIdRef = useRef(0);
  // Every auto-dismiss timer (toasts, error banner) so cleanup can clear them.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  // The "going alone" gag: a full-screen photo for 7s whenever a loner is called.
  const [lonerFx, setLonerFx] = useState(false);
  const [lonerCaller, setLonerCaller] = useState<string | null>(null);
  const lonerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playerId) return;
    if (listenersBoundRef.current) return;
    listenersBoundRef.current = true;

    const socket = getSocket();
    const timers = timersRef.current;

    /** setTimeout that the effect cleanup can cancel. */
    function later(fn: () => void, ms: number) {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    }

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
        const caller =
          snapshotRef.current?.members.find((m) => m.seat === Number(p[1]))?.name ?? null;
        setLonerCaller(caller);
        setLonerFx(true);
        if (lonerTimerRef.current) clearTimeout(lonerTimerRef.current);
        lonerTimerRef.current = setTimeout(() => setLonerFx(false), 7000);
      }

      const text = eventText(ev, snapshotRef.current);
      if (!text) return;
      const id = ++toastIdRef.current;
      setToasts((cur) => [...cur.slice(-2), { id, text }]);
      later(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4000);
    }
    function onErr(msg: string) {
      setErrorBanner(msg);
      later(() => setErrorBanner((cur) => (cur === msg ? null : cur)), 4000);
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
      let token: string | undefined;
      try {
        token = readRoomToken(code);
      } catch {
        /* storage unavailable — join without a token */
      }
      socket.emit(
        'room:join',
        {
          code,
          name: name || 'Player',
          playerId: playerId!,
          asSpectator: role === 'spectate',
          token,
        },
        (res) => {
          if (!res.ok) {
            if (!isReconnect) {
              setJoining(false);
              setJoinFailed(res.error);
            } else {
              onErr(res.error);
            }
            return;
          }
          try {
            storeRoomToken(code, res.token);
          } catch {
            /* ignore */
          }
          hasJoinedRef.current = true;
          setJoining(false);
          snapshotRef.current = res.snapshot;
          setSnapshot(res.snapshot);
        }
      );
    }

    // Named handler so cleanup removes only ours, not every 'connect' listener.
    // On a cold load the socket is still connecting, so this IS the first join.
    function onConnect() {
      joinRoom(hasJoinedRef.current);
    }

    socket.on('room:snapshot', onSnap);
    socket.on('room:error', onErr);
    socket.on('chat:msg', onMsg);
    socket.on('room:event', onEvent);
    socket.on('connect', onConnect);

    // Already connected (navigated here from the landing page): join now.
    // Otherwise the 'connect' handler above performs the first join — emitting
    // here too would send room:join twice.
    if (socket.connected) joinRoom(false);

    // When the tab becomes visible again (mobile lock/unlock, app switch),
    // refresh the snapshot in case we missed any events while backgrounded.
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        if (!socket.connected) socket.connect();
        else joinRoom(hasJoinedRef.current);
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
      for (const id of timers) clearTimeout(id);
      timers.clear();
      // Release the guards, or a re-run of this effect tears the listeners down
      // and then bails at the `listenersBoundRef` check without re-adding them —
      // leaving the client deaf to room:snapshot and its lobby frozen at the
      // join-time seats.
      listenersBoundRef.current = false;
      hasJoinedRef.current = false;
    };
  }, [code, playerId, name, role]);

  // Stable across renders so Table (React.memo) only re-renders on real
  // snapshot/chat changes, not on every toast tick. The socket is fetched
  // lazily inside each handler — getSocket() must not run during SSR.
  const handlers = useMemo(
    () => ({
      onOrder: (alone: boolean) => getSocket().emit('bid:order', { alone }),
      onPass: () => getSocket().emit('bid:pass'),
      onCall: (suit: Suit, alone: boolean) => getSocket().emit('bid:call', { suit, alone }),
      onDiscard: (cardId: string) => getSocket().emit('discard:card', { cardId }),
      onFarmersRedeal: () => getSocket().emit('farmers:redeal'),
      onPlay: (cardId: string) => getSocket().emit('play:card', { cardId }),
      onChat: (text: string) => getSocket().emit('chat:send', { text }),
      onNextHand: () => getSocket().emit('room:nextHand'),
      onRematch: () => getSocket().emit('room:rematch'),
      onLeave: () => {
        // Tell the server we're intentionally leaving so it cleans the room up
        // immediately (no 60s grace, and bot-only rooms get deleted). The server
        // disconnects us after processing, so we just emit then navigate — letting
        // the emit flush instead of racing it with a client-side disconnect.
        getSocket().emit('room:leave');
        router.push('/');
      },
      // Lobby-only actions.
      onStart: () => getSocket().emit('room:start'),
      onPromote: (pid: string, seat: 0 | 1 | 2 | 3) =>
        getSocket().emit('room:promote', { playerId: pid, seat }),
      onAddBot: (seat: 0 | 1 | 2 | 3) => getSocket().emit('room:addBot', { seat }),
      onFillBots: () => getSocket().emit('room:fillBots'),
      onRemoveBot: (seat: 0 | 1 | 2 | 3) => getSocket().emit('room:removeBot', { seat }),
      onMoveSeat: (seat: 0 | 1 | 2 | 3) => getSocket().emit('room:moveSeat', { seat }),
    }),
    [router]
  ) satisfies Handlers;

  if (joinFailed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="bg-black/50 border border-red-400/40 rounded-xl p-6 max-w-md text-center">
          <div className="text-red-300 font-medium">Couldn&apos;t join room</div>
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
    return <Connecting />;
  }

  return (
    <>
      {/* "Going alone" gag — full-screen photo for 7 seconds on any loner call. */}
      {lonerFx && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 px-3 fade-in pointer-events-none"
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
        <div
          role="alert"
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white text-sm px-3 py-1.5 rounded-md shadow-lg"
        >
          {errorBanner}
        </div>
      )}

      {/* Game-event toasts ("Maggie called Hearts", "Rematch!"). The live
          region is always mounted — screen readers only announce changes to a
          region that already existed. */}
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

      {snapshot.state.phase === 'LOBBY' ? (
        <Lobby
          snapshot={snapshot}
          myId={playerId}
          onStart={handlers.onStart}
          onPromote={handlers.onPromote}
          onAddBot={handlers.onAddBot}
          onFillBots={handlers.onFillBots}
          onRemoveBot={handlers.onRemoveBot}
          onMoveSeat={handlers.onMoveSeat}
          onLeave={handlers.onLeave}
        />
      ) : (
        <Table snapshot={snapshot} myId={playerId} chat={chat} handlers={handlers} />
      )}
    </>
  );
}
