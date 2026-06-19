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

/**
 * Play a short bell / "ting". No-op if audio is unavailable.
 *
 * Synthesized additively: a bright fundamental plus a couple of *inharmonic*
 * overtones (the non-integer ratios are what make it read as struck metal
 * rather than a plain beep). Sharp attack, exponential ring-out, with the
 * higher partials fading faster than the fundamental — as a real bell does.
 */
export function playPing(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  try {
    const now = c.currentTime;
    const fundamental = 1320; // bright, bell-like "ting"
    const partials = [
      { ratio: 1, gain: 1.0, decay: 1.1 },
      { ratio: 2.76, gain: 0.5, decay: 0.7 }, // inharmonic — metallic shimmer
      { ratio: 5.4, gain: 0.28, decay: 0.4 }, // bright top, fades quickly
    ];

    const master = c.createGain();
    master.gain.value = 0.22;
    master.connect(c.destination);

    for (const p of partials) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = fundamental * p.ratio;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(p.gain, now + 0.004); // near-instant strike
      g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay); // ring out
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + p.decay + 0.05);
    }
  } catch {
    /* ignore — audio is a nicety, never a hard failure */
  }
}
