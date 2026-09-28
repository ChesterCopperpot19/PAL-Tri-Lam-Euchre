'use client';
import { useEffect, useRef, useState } from 'react';
import type { PendingTrick } from './TrickArea';
import type { Phase, SeatIndex, Trick } from '@/server/engine/types';

/**
 * After a trick is taken, hold all its cards visible for ~1.2s, then animate them
 * toward the winning seat for ~0.75s. The game-winning trick is instead frozen on
 * the felt for 3s. Returns the trick to draw (null when none): the table
 * suppresses the hand-end and game-over modals while it's set, so the last trick
 * is fully visible before the summary appears.
 */
export function useTrickAnimation(completedTricks: Trick[], phase: Phase): PendingTrick | null {
  const [pendingTrick, setPendingTrick] = useState<PendingTrick | null>(null);
  const prevTrickCountRef = useRef(0);
  // Only `completedTricks.length` moving past `prevTrickCountRef` starts an
  // animation, so re-runs from the phase dep (which only ever changes in the
  // same snapshot as a length change) are no-ops mid-animation.
  useEffect(() => {
    const ct = completedTricks;
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
        // GameOver modal is gated on !pendingTrick). Held static — no fly.
        if (phase === 'GAME_OVER') {
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
    // `completedTricks` is a fresh array on every snapshot; depending on its
    // identity would restart the fly animation mid-flight. Length + phase is the cue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedTricks.length, phase]);
  return pendingTrick;
}
