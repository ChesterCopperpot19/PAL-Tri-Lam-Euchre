'use client';
// Tiny Web Audio "ping" for the your-turn cue. Synthesized so there's no audio
// file to host. Browsers require a prior user gesture before audio can play, so
// unlockAudio() is wired to the first interaction and resumes the context.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Resume the audio context from within a user gesture so later pings are allowed. */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

/** Play a short, pleasant two-tone "ping". No-op if audio is unavailable. */
export function playPing(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  try {
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1318.5, now + 0.09); // up to E6 — a bright "ding-ding"
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    /* ignore — audio is a nicety, never a hard failure */
  }
}
