'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getSocket, disconnectSocket } from '@/lib/socket-client';
import { useDisplayName, usePlayerId } from '@/lib/usePlayerId';
import type { ChatMessage, RoomSnapshot } from '@/lib/shared-types';
import Lobby from '@/components/Lobby';
import Table from '@/components/Table';
import type { Suit } from '@/server/engine/types';

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

  useEffect(() => {
    if (!playerId) return;
    if (joinedRef.current) return;
    joinedRef.current = true;

    const socket = getSocket();

    function onSnap(s: RoomSnapshot) {
      setSnapshot(s);
    }
    function onErr(msg: string) {
      setErrorBanner(msg);
      setTimeout(() => setErrorBanner((cur) => (cur === msg ? null : cur)), 4000);
    }
    function onMsg(m: ChatMessage) {
      setChat((cur) => [...cur, m].slice(-200));
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
          setSnapshot(res.snapshot);
        }
      );
    }

    socket.on('room:snapshot', onSnap);
    socket.on('room:error', onErr);
    socket.on('chat:msg', onMsg);
    socket.on('connect', () => joinRoom(true));

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
      socket.off('connect');
      document.removeEventListener('visibilitychange', onVisibility);
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
    onPlay: (cardId: string) => socket.emit('play:card', { cardId }),
    onChat: (text: string) => socket.emit('chat:send', { text }),
    onNextHand: () => socket.emit('room:nextHand'),
    onLeave: () => {
      disconnectSocket();
      router.push('/');
    },
  };

  return (
    <>
      {errorBanner && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white text-sm px-3 py-1.5 rounded-md shadow-lg">
          {errorBanner}
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
        />
      ) : (
        <Table snapshot={snapshot} myId={playerId} chat={chat} handlers={handlers} />
      )}
    </>
  );
}
