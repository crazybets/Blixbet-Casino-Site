import { useRef, useCallback } from "react";

function getCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext | null {
  if (!ref.current) {
    try { ref.current = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  }
  if (ref.current.state === "suspended") ref.current.resume();
  return ref.current;
}

function mkNoise(ctx: AudioContext, dur: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function useTowersSounds() {
  const acRef = useRef<AudioContext | null>(null);

  /* ── Place Bet click — soft warm sine "tick" shared across all games
       so Mines/Towers/Cups/ChickenCross feel consistent with Crash. ── */
  const playPlaceBet = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
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
    } catch {}
  }, []);

  /* ── Step up: ascending whoosh + glassy tone — climbing a level ── */
  const playStep = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;

      // Rising sine sweep — the "whoosh up" sensation
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(720, t + 0.12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.2);

      // Glassy overtone that fades in slightly delayed — gives a crystal "ding"
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(900, t + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(1200, t + 0.14);
      g2.gain.setValueAtTime(0, t + 0.05);
      g2.gain.linearRampToValueAtTime(0.09, t + 0.08);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc2.connect(g2); g2.connect(ctx.destination);
      osc2.start(t + 0.05); osc2.stop(t + 0.24);

      // Short noise swish for air texture
      const src = ctx.createBufferSource();
      src.buffer = mkNoise(ctx, 0.12);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2400;
      bp.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.06, t + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      src.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
      src.start(t); src.stop(t + 0.12);
    } catch { /* ignore */ }
  }, []);

  /* ── Mine hit: deep boom + explosion crackle ── */
  const playMineHit = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;

      // Deep punchy drop
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.35);
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.44);

      // Noise body — explosion rumble
      const src = ctx.createBufferSource();
      src.buffer = mkNoise(ctx, 0.28);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1000;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.55, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      src.connect(lp); lp.connect(ng); ng.connect(ctx.destination);
      src.start(t); src.stop(t + 0.3);

      // High crackle burst
      const src2 = ctx.createBufferSource();
      src2.buffer = mkNoise(ctx, 0.1);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 3500;
      const ng2 = ctx.createGain();
      ng2.gain.setValueAtTime(0.22, t);
      ng2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      src2.connect(hp); hp.connect(ng2); ng2.connect(ctx.destination);
      src2.start(t); src2.stop(t + 0.11);
    } catch { /* ignore */ }
  }, []);

  /* ── Cashout / tower cleared: triumphant 5-note rising fanfare ── */
  const playCashout = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      // Major arpeggio: C5 E5 G5 B5 C6 — bright, victorious
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.50];
      notes.forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.08;

        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.34);

        // Triangle overtone for shimmer
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.value = freq * 2;
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(0.07, t + 0.008);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc2.connect(g2); g2.connect(ctx.destination);
        osc2.start(t); osc2.stop(t + 0.24);
      });
    } catch { /* ignore */ }
  }, []);

  return { playPlaceBet, playStep, playMineHit, playCashout };
}
