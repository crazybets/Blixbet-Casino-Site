import { useRef, useCallback, useEffect } from "react";

/**
 * Cups game sound effects (Web Audio synthesis — no asset files needed).
 *
 *   playCountdownTick(secondsLeft) — short blip per second of pre-shuffle countdown.
 *                                    Final beep at secondsLeft===1 is higher pitch.
 *   playShuffle(durationMs)        — looping wood/cup-knock pattern that runs
 *                                    while the cups physically shuffle.
 *   playWin()                      — bright ascending arpeggio + shimmer.
 *   playLose()                     — short low descending thud.
 *   stopAll()                      — cancel any in-flight loops/timers.
 */

function getCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext | null {
  if (!ref.current) {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ref.current = new Ctor();
    } catch {
      return null;
    }
  }
  if (ref.current && ref.current.state === "suspended") {
    void ref.current.resume();
  }
  return ref.current;
}

function isMuted(): boolean {
  try {
    return localStorage.getItem("blixbet_muted") === "true";
  } catch {
    return false;
  }
}

export function useCupsSounds() {
  const acRef = useRef<AudioContext | null>(null);
  const shuffleTimers = useRef<number[]>([]);

  const stopAll = useCallback(() => {
    shuffleTimers.current.forEach((t) => clearTimeout(t));
    shuffleTimers.current = [];
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  /** Place Bet click — soft warm sine "tick" shared across all games
   *  so Mines/Towers/Cups/ChickenCross feel consistent with Crash. */
  const playPlaceBet = useCallback(() => {
    if (isMuted()) return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 360;
      g.gain.setValueAtTime(0.10, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.11);
    } catch { /* noop */ }
  }, []);

  /** Soft "tick" used for each second of the countdown. Higher pitch on the last beat. */
  const playCountdownTick = useCallback((secondsLeft: number) => {
    if (isMuted()) return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const isFinal = secondsLeft <= 1;

      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = isFinal ? 1320 : 880;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(isFinal ? 0.18 : 0.12, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + (isFinal ? 0.18 : 0.09));
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + (isFinal ? 0.22 : 0.12));
    } catch { /* noop */ }
  }, []);

  /** A single muted "knock" — the wooden bottom of a cup tapping the table. */
  const knock = useCallback((when: number, vol: number, freq: number) => {
    const ctx = acRef.current;
    if (!ctx) return;
    try {
      // Body: low triangle thump
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, when);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, when + 0.07);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.10);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.12);

      // Click transient: short noise burst
      const bufferSize = Math.floor(ctx.sampleRate * 0.02);
      const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.4, when);
      ng.gain.exponentialRampToValueAtTime(0.001, when + 0.025);
      const filt = ctx.createBiquadFilter();
      filt.type = "highpass";
      filt.frequency.value = 1500;
      noise.connect(filt);
      filt.connect(ng);
      ng.connect(ctx.destination);
      noise.start(when);
      noise.stop(when + 0.04);
    } catch { /* noop */ }
  }, []);

  /** Shuffle pattern: ~10 wooden knocks evenly spread across `durationMs`. */
  const playShuffle = useCallback((durationMs: number) => {
    if (isMuted()) return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    stopAll();

    const knocks = Math.max(8, Math.round(durationMs / 320));
    for (let i = 0; i < knocks; i++) {
      const delay = (i / knocks) * durationMs + (Math.random() * 60 - 30);
      const tm = window.setTimeout(() => {
        const ac = acRef.current;
        if (!ac) return;
        // Vary pitch & volume slightly per knock
        const freq = 220 + Math.random() * 90;
        const vol = 0.13 + Math.random() * 0.05;
        knock(ac.currentTime, vol, freq);
      }, Math.max(0, delay));
      shuffleTimers.current.push(tm);
    }

    // Final settle thud
    const settleTm = window.setTimeout(() => {
      const ac = acRef.current;
      if (!ac) return;
      knock(ac.currentTime, 0.22, 180);
    }, durationMs - 60);
    shuffleTimers.current.push(settleTm);
  }, [knock, stopAll]);

  const playWin = useCallback(() => {
    if (isMuted()) return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const nt = t + i * 0.09;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, nt);
        g.gain.linearRampToValueAtTime(0.18, nt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, nt + 0.32);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(nt);
        osc.stop(nt + 0.36);
      });

      // Shimmer tail
      const shimmer = ctx.createOscillator();
      const sg = ctx.createGain();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(2200, t + 0.32);
      shimmer.frequency.exponentialRampToValueAtTime(3600, t + 0.7);
      sg.gain.setValueAtTime(0, t + 0.32);
      sg.gain.linearRampToValueAtTime(0.035, t + 0.38);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.72);
      shimmer.connect(sg);
      sg.connect(ctx.destination);
      shimmer.start(t + 0.32);
      shimmer.stop(t + 0.75);
    } catch { /* noop */ }
  }, []);

  const playLose = useCallback(() => {
    if (isMuted()) return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(380, t);
      osc.frequency.exponentialRampToValueAtTime(170, t + 0.28);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);

      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(220, t + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(95, t + 0.36);
      g2.gain.setValueAtTime(0.1, t + 0.12);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.start(t + 0.12);
      osc2.stop(t + 0.42);
    } catch { /* noop */ }
  }, []);

  return { playPlaceBet, playCountdownTick, playShuffle, playWin, playLose, stopAll };
}
