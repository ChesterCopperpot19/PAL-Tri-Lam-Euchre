'use client';
import { useEffect, useRef, useState } from 'react';
import { playPing, unlockAudio } from '@/lib/sound';

/**
 * The turn-sound preference (persisted, default on): unlocks audio on the first
 * gesture (browsers block it until then) and pings the moment `isMyTurnNow`
 * becomes true.
 */
export function useSoundPreference(isMyTurnNow: boolean): { soundOn: boolean; toggleSound: () => void } {
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

  return { soundOn, toggleSound };
}
