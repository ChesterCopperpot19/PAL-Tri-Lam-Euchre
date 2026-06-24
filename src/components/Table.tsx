'use client';
import { useEffect, useRef, useState } from 'react';
import { CardFace } from './Card';
import Hand from './Hand';
import PlayerSeat from './PlayerSeat';
import TrickArea, { type PendingTrick } from './TrickArea';
import TrumpIndicator from './TrumpIndicator';
import TrumpBanner from './TrumpBanner';
import TrumpBadge from './TrumpBadge';
import ScoreBoard from './ScoreBoard';
import BiddingPanel from './BiddingPanel';
import DiscardPanel from './DiscardPanel';
import FarmerPanel from './FarmerPanel';
import RulesModal from './RulesModal';
import HandSummary from './HandSummary';
import GameOver from './GameOver';
import type { RoomSnapshot, ChatMessage } from '@/lib/shared-types';
import type { SeatIndex, Suit } from '@/server/engine/types';
import { teamName, tricksBySeat } from '@/lib/format';
import { sortHand } from '@/lib/hand-sort';
import { playPing, unlockAudio } from '@/lib/sound';
import Chat from './Chat';

type Handlers = {
  onOrder: (alone: boolean) => void;
  onPass: () => void;
  onCall: (suit: Suit, alone: boolean) => void;
  onDiscard: (cardId: string) => void;
  onFarmersSwap: (cardIds: string[]) => void;
  onPlay: (cardId: string) => void;
  onChat: (text: string) => void;
  onNextHand: () => void;
  onRematch: () => void;
  onLeave: () => void;
};

export default function Table({
  snapshot,
  myId,
  chat,
  handlers,
}: {
  snapshot: RoomSnapshot;
  myId: string;
  chat: ChatMessage[];
  handlers: Handlers;
}) {
  const state = snapshot.state;
  const viewerSeat = state.viewerSeat;
  const isSpectator = state.spectator;
  const isHost = snapshot.hostPlayerId === myId;
  const me = snapshot.members.find((m) => m.playerId === myId);

  // Map "absolute seat 0..3" to "table position relative to viewer".
  const v: SeatIndex = (viewerSeat ?? 0) as SeatIndex;
  const seatAt = (relPos: 'bottom' | 'left' | 'top' | 'right'): SeatIndex => {
    const offsets: Record<typeof relPos, number> = {
      bottom: 0,
      left: 1,
      top: 2,
      right: 3,
    };
    return ((v + offsets[relPos]) % 4) as SeatIndex;
  };

  const memberAt = (s: SeatIndex) => snapshot.members.find((m) => m.seat === s);

  const myHand =
    viewerSeat !== null
      ? sortHand(state.seats[viewerSeat].hand ?? [], state.trump)
      : [];
  const myTurn = viewerSeat !== null && state.turn === viewerSeat;
  const meIsDealer = viewerSeat !== null && state.dealer === viewerSeat;
  const tricksPerSeat = tricksBySeat(state.completedTricks);
  const showTricks =
    state.phase === 'PLAYING' || state.phase === 'HAND_END';
  const nsName = teamName(snapshot.members, 'NS');
  const ewName = teamName(snapshot.members, 'EW');

  // Names for status messages
  const turnMember = snapshot.members.find((m) => m.seat === state.turn);
  const dealerMember = snapshot.members.find((m) => m.seat === state.dealer);
  const dealerName = dealerMember?.name ?? 'Dealer';
  const turnName = turnMember?.name ?? '...';

  // Going-alone state
  const isAlone = state.alone && state.maker !== null;
  const aloneName =
    state.maker !== null
      ? snapshot.members.find((m) => m.seat === state.maker)?.name ?? 'Maker'
      : '';
  const viewerSittingOut =
    viewerSeat !== null && state.sittingOut.includes(viewerSeat);
  const inPlayPhase =
    state.phase === 'DEALER_DISCARD' || state.phase === 'PLAYING';

  // Is it actually the viewer's moment to act? (drives the banner + ping)
  const actionablePhase =
    state.phase === 'BIDDING_1' ||
    state.phase === 'BIDDING_2' ||
    state.phase === 'DEALER_DISCARD' ||
    state.phase === 'PLAYING';
  const isMyTurnNow = myTurn && actionablePhase && !viewerSittingOut;
  const turnLabel =
    state.phase === 'DEALER_DISCARD'
      ? 'Your turn — discard a card'
      : state.phase === 'PLAYING'
        ? 'Your turn to play'
        : 'Your turn to bid';

  // After a trick is taken, hold all 4 cards visible for ~1.2s, then animate them
  // toward the winning seat for ~0.75s. Suppresses the hand-end modal during the
  // animation so the final trick is fully visible before the summary appears.
  const [pendingTrick, setPendingTrick] = useState<PendingTrick | null>(null);
  const prevTrickCountRef = useRef(0);
  // The "loner made" gag: a 5-second photo at hand-end when someone wins a loner
  // (went alone and was not euchred).
  const [lonerWonFx, setLonerWonFx] = useState(false);
  const lonerWonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRules, setShowRules] = useState(false);
  useEffect(() => {
    const ct = state.completedTricks;
    const len = ct.length;
    if (len === 0) {
      // New hand has been dealt; clear any leftover state.
      prevTrickCountRef.current = 0;
      setPendingTrick(null);
      return;
    }
    if (len > prevTrickCountRef.current) {
      const trick = ct[len - 1];
      if (trick?.winner !== undefined && trick.plays.length > 0) {
        setPendingTrick({
          plays: trick.plays as PendingTrick['plays'],
          winnerSeat: trick.winner as SeatIndex,
          animFly: false,
        });
        // The game-winning trick: freeze it on the felt for 3s so everyone can
        // see how the final hand was won, then reveal the winner screen (the
        // GameOver modal is gated on !pendingTrick below). Held static — no fly.
        if (state.phase === 'GAME_OVER') {
          const holdT = setTimeout(() => {
            setPendingTrick(null);
            prevTrickCountRef.current = len;
          }, 3000);
          return () => clearTimeout(holdT);
        }
        const flyT = setTimeout(() => {
          setPendingTrick((cur) => (cur ? { ...cur, animFly: true } : cur));
        }, 1200);
        const clearT = setTimeout(() => {
          setPendingTrick(null);
          // Mark this trick as fully processed only after the animation completes,
          // so React Strict Mode's mount/unmount/mount cycle re-arms the timer
          // instead of skipping it.
          prevTrickCountRef.current = len;
        }, 1200 + 750);
        return () => {
          clearTimeout(flyT);
          clearTimeout(clearT);
        };
      }
      prevTrickCountRef.current = len;
    }
  }, [state.completedTricks.length]);

  // When a hand ends on a *swept* loner (went alone AND took all 5 tricks — a
  // lone march), flash the celebration photo for 7 seconds. lastHand is set in
  // the same state update that completes the 5th trick, so length === 5 is the cue.
  useEffect(() => {
    const last = state.lastHand;
    if (state.completedTricks.length === 5 && last && last.alone && last.march) {
      setLonerWonFx(true);
      if (lonerWonTimerRef.current) clearTimeout(lonerWonTimerRef.current);
      lonerWonTimerRef.current = setTimeout(() => setLonerWonFx(false), 7000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.completedTricks.length]);
  useEffect(() => () => { if (lonerWonTimerRef.current) clearTimeout(lonerWonTimerRef.current); }, []);

  // Sound preference (persisted). Default on.
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem('euchre.sound') !== 'off');
    } catch {
      /* ignore */
    }
  }, []);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // Browsers block audio until the user interacts — unlock on the first gesture.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Ping the moment it becomes the viewer's turn (only the player whose turn it is).
  const prevMyTurnRef = useRef(false);
  useEffect(() => {
    if (isMyTurnNow && !prevMyTurnRef.current && soundOnRef.current) {
      playPing();
    }
    prevMyTurnRef.current = isMyTurnNow;
  }, [isMyTurnNow]);

  function toggleSound() {
    setSoundOn((on) => {
      const next = !on;
      try {
        localStorage.setItem('euchre.sound', next ? 'on' : 'off');
      } catch {
        /* ignore */
      }
      if (next) {
        unlockAudio();
        playPing(); // confirm it's audible
      }
      return next;
    });
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 sm:px-5 py-3 bg-black/40 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60">Room</div>
          <div className="font-display text-2xl text-gold tracking-widest">{snapshot.code}</div>
          {isSpectator && (
            <span className="bg-violet-600/30 border border-violet-400/50 text-violet-200 text-xs uppercase tracking-wider px-2 py-0.5 rounded">
              👁 Spectator
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-black/55 border border-white/10 rounded-full px-3 py-1.5 text-sm">
            <span className="text-white/70 text-xs truncate max-w-[180px]" title={nsName}>{nsName}</span>
            <span className="font-display text-gold text-lg leading-none">{state.scores.NS}</span>
            <span className="text-white/30">·</span>
            <span className="text-white/70 text-xs truncate max-w-[180px]" title={ewName}>{ewName}</span>
            <span className="font-display text-gold text-lg leading-none">{state.scores.EW}</span>
          </div>
          <TrumpIndicator trump={state.trump} />
          <button
            onClick={toggleSound}
            className="text-base leading-none hover:opacity-80"
            aria-label={soundOn ? 'Mute turn sound' : 'Unmute turn sound'}
            aria-pressed={soundOn}
            title={soundOn ? 'Turn sound on — tap to mute' : 'Turn sound off — tap to unmute'}
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
          <button
            onClick={() => setShowRules(true)}
            className="text-xs text-white/60 hover:text-white"
            title="Show the house rules"
          >
            📖 Rules
          </button>
          <button
            onClick={handlers.onLeave}
            className="text-xs text-white/60 hover:text-white"
          >
            Leave
          </button>
        </div>
      </header>
      <div className="sm:hidden flex items-center justify-center gap-2 py-1.5 px-2 bg-black/35 border-b border-white/10 text-sm flex-wrap">
        <span className="text-white/70 text-xs truncate max-w-[40%]" title={nsName}>{nsName}</span>
        <span className="font-display text-gold text-lg leading-none">{state.scores.NS}</span>
        <span className="text-white/30">·</span>
        <span className="text-white/70 text-xs truncate max-w-[40%]" title={ewName}>{ewName}</span>
        <span className="font-display text-gold text-lg leading-none">{state.scores.EW}</span>
      </div>

      {/* Big, unmistakable "it's your turn" banner — only for the player to act. */}
      {isMyTurnNow && (
        <div
          role="status"
          aria-live="assertive"
          className="w-full px-3 py-2.5 flex items-center justify-center gap-3 bg-gold text-black shadow-lg border-y-2 border-yellow-200 your-turn-banner"
        >
          <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full bg-black/80 animate-pulse" />
          <span className="font-display text-xl sm:text-3xl font-semibold tracking-wide uppercase">
            {turnLabel}
          </span>
          <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full bg-black/80 animate-pulse" />
        </div>
      )}

      {/* Prominent trump banner — visible to everyone once trump is set.
          Keyed on trump so a new hand's trump remounts the banner and
          re-triggers the brief celebration before it collapses. */}
      {state.trump && (
        <TrumpBanner
          key={state.trump}
          state={state}
          members={snapshot.members}
        />
      )}

      {/* Prominent going-alone banner — unmistakable that the maker is solo. */}
      {isAlone && inPlayPhase && (
        <div className="w-full px-3 py-2 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-700 via-fuchsia-600 to-violet-700 text-white shadow-lg border-y-2 border-fuchsia-300">
          <span className="text-lg">🔥</span>
          <span className="font-display text-lg sm:text-2xl tracking-wide">
            {aloneName} is going ALONE
          </span>
          <span className="text-lg">🔥</span>
        </div>
      )}

      {/* Main grid: table + chat */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 p-2 sm:p-4">
        {/* Table area */}
        <div className="relative flex flex-col items-center justify-between min-h-0">
          {/* Large always-on trump indicator (top-left of the table). */}
          {state.trump && (
            <div className="absolute top-1 left-1 z-10">
              <TrumpBadge trump={state.trump} />
            </div>
          )}
          {/* Top seat */}
          <div className="w-full flex justify-center mt-2">
            <SeatBlock
              relPos="top"
              seat={seatAt('top')}
              snapshot={snapshot}
              tricks={tricksPerSeat}
              showTricks={showTricks}
              winFlash={pendingTrick?.winnerSeat === seatAt('top')}
            />
          </div>

          {/* Middle row: left, felt+trick, right */}
          <div className="w-full flex items-center justify-center gap-3 sm:gap-6">
            <SeatBlock
              relPos="left"
              seat={seatAt('left')}
              snapshot={snapshot}
              tricks={tricksPerSeat}
              showTricks={showTricks}
              winFlash={pendingTrick?.winnerSeat === seatAt('left')}
            />

            <div className="felt p-6 sm:p-10 relative">
              <TrickArea
                plays={state.currentTrick.plays}
                upcard={state.upcard}
                trump={state.trump}
                viewerSeat={viewerSeat}
                phase={state.phase}
                pendingTrick={pendingTrick}
              />
              {/* Whose turn is it to bid? */}
              {(state.phase === 'BIDDING_1' || state.phase === 'BIDDING_2') && turnMember && (
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-3 bg-black/75 border border-gold/50 rounded-full px-3 py-1 text-xs whitespace-nowrap shadow-lg">
                  <span className="text-white/70">Bidding:</span>{' '}
                  <span className="text-gold font-medium">{turnName}</span>
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                </div>
              )}
              {/* During dealer-discard, who's discarding */}
              {state.phase === 'DEALER_DISCARD' && (
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-3 bg-black/75 border border-gold/50 rounded-full px-3 py-1 text-xs whitespace-nowrap shadow-lg">
                  <span className="text-gold font-medium">{dealerName}</span>
                  <span className="text-white/80"> is taking up the upcard…</span>
                </div>
              )}
            </div>

            <SeatBlock
              relPos="right"
              seat={seatAt('right')}
              snapshot={snapshot}
              tricks={tricksPerSeat}
              showTricks={showTricks}
              winFlash={pendingTrick?.winnerSeat === seatAt('right')}
            />
          </div>

          {/* Bottom: action panel + own hand */}
          <div className="w-full flex flex-col items-center gap-2 mb-2">
            {/* Bidding / discard panels for the active player */}
            {!isSpectator && (state.phase === 'BIDDING_1' || state.phase === 'BIDDING_2') && (
              <BiddingPanel
                state={state}
                isYourTurn={myTurn}
                isDealer={meIsDealer}
                dealerName={dealerName}
                onOrder={handlers.onOrder}
                onPass={handlers.onPass}
                onCall={handlers.onCall}
              />
            )}
            {!isSpectator &&
              state.phase === 'BIDDING_1' &&
              myTurn &&
              viewerSeat !== null &&
              !(state.farmersSwapped ?? []).includes(viewerSeat) &&
              myHand.length === 5 &&
              myHand.every((c) => c.rank === '9' || c.rank === '10') && (
                <FarmerPanel hand={myHand} onSwap={handlers.onFarmersSwap} />
              )}
            {!isSpectator && state.phase === 'DEALER_DISCARD' && meIsDealer && (
              <DiscardPanel
                hand={myHand}
                upcardId={state.upcard?.id ?? null}
                onDiscard={handlers.onDiscard}
              />
            )}

            {/* Hand or spectator placeholder */}
            {!isSpectator ? (
              <>
                {viewerSeat !== null &&
                  state.phase !== 'LOBBY' &&
                  state.phase !== 'GAME_OVER' && (
                    <div
                      className={`flex items-center gap-2 text-xs text-white/90 bg-black/45 border border-white/10 rounded-full px-3 py-1 ${
                        state.turn === viewerSeat &&
                        state.phase !== 'HAND_END'
                          ? 'turn-ring'
                          : ''
                      } ${pendingTrick?.winnerSeat === viewerSeat ? 'seat-win-flash' : ''}`}
                    >
                      <span className="font-medium">{me?.name ?? 'You'}</span>
                      {state.dealer === viewerSeat && (
                        <span className="text-[10px] uppercase tracking-wider bg-gold text-black rounded px-1.5 py-0.5">
                          Dealer
                        </span>
                      )}
                      {state.maker === viewerSeat && (
                        <span className="text-[10px] uppercase tracking-wider bg-gold text-black rounded px-1.5 py-0.5">
                          Maker
                        </span>
                      )}
                      {state.turn === viewerSeat &&
                        state.phase !== 'HAND_END' && (
                          <span className="text-[10px] uppercase tracking-wider bg-gold text-black rounded px-1.5 py-0.5">
                            Your turn
                          </span>
                        )}
                      {showTricks && (
                        <span
                          className="text-[10px] uppercase tracking-wider bg-white/10 border border-white/15 rounded px-1.5 py-0.5"
                          title="Tricks you've won this hand"
                        >
                          🏆 {tricksPerSeat[viewerSeat]}
                        </span>
                      )}
                    </div>
                  )}
                {viewerSittingOut && inPlayPhase && (
                  <div className="text-sm text-violet-200 bg-violet-900/40 border border-violet-400/40 rounded-lg px-3 py-1.5 text-center">
                    You’re sitting out this hand — your partner is going alone.
                  </div>
                )}
                <div
                  className={
                    viewerSittingOut && inPlayPhase
                      ? 'opacity-40 grayscale pointer-events-none'
                      : ''
                  }
                >
                  <Hand
                    cards={myHand}
                    legalIds={
                      state.phase === 'PLAYING' && myTurn && !viewerSittingOut
                        ? state.legalPlayIds
                        : []
                    }
                    onPlay={handlers.onPlay}
                  />
                </div>
              </>
            ) : (
              <div className="bg-black/45 border border-violet-400/30 rounded-xl px-4 py-3 text-sm text-white/80">
                You are spectating. Hands are hidden from spectators.
              </div>
            )}
          </div>

          {/* Floating score board — desktop only (mobile shows compact bar in header) */}
          <div className="hidden lg:block absolute top-2 right-2">
            <ScoreBoard state={state} members={snapshot.members} />
          </div>
        </div>

        {/* Chat sidebar */}
        <div className="lg:h-full h-72">
          <Chat messages={chat} onSend={handlers.onChat} />
        </div>
      </div>

      {/* Modals */}
      {state.phase === 'HAND_END' && state.lastHand && !pendingTrick && (
        <HandSummary
          summary={state.lastHand}
          members={snapshot.members}
          myId={myId}
        />
      )}
      {state.phase === 'GAME_OVER' && !pendingTrick && !lonerWonFx && (
        <GameOver
          state={state}
          members={snapshot.members}
          isSpectator={isSpectator}
          onRematch={handlers.onRematch}
          onLeave={handlers.onLeave}
        />
      )}

      {/* "Loner swept" gag — full-screen photo for 7 seconds when someone takes all 5 alone. */}
      {lonerWonFx && (
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 px-3 fade-in"
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/loner-won.jpg"
            alt=""
            className="max-h-[80vh] max-w-[94vw] rounded-xl border-2 border-gold object-contain shadow-2xl"
          />
          <div className="mt-4 font-display text-3xl sm:text-4xl uppercase tracking-[0.2em] text-gold drop-shadow text-center">
            {state.lastHand ? `${memberAt(state.lastHand.maker)?.name ?? 'Someone'} swept the loner!` : 'Loner swept!'}
          </div>
        </div>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

function SeatBlock({
  relPos,
  seat,
  snapshot,
  tricks,
  showTricks,
  winFlash = false,
}: {
  relPos: 'left' | 'top' | 'right';
  seat: SeatIndex;
  snapshot: RoomSnapshot;
  tricks: Record<SeatIndex, number>;
  showTricks: boolean;
  winFlash?: boolean;
}) {
  const member = snapshot.members.find((m) => m.seat === seat);
  const state = snapshot.state;
  const handCount = state.seats[seat].handCount;
  return (
    <PlayerSeat
      position={relPos}
      member={member}
      handCount={handCount}
      isDealer={state.dealer === seat}
      isTurn={state.turn === seat && state.phase !== 'LOBBY' && state.phase !== 'HAND_END' && state.phase !== 'GAME_OVER'}
      isMaker={state.maker === seat}
      sittingOut={state.sittingOut.includes(seat)}
      trickCount={tricks[seat]}
      showTricks={showTricks}
      winFlash={winFlash}
    />
  );
}
