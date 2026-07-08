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

export function useMinesSounds() {
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

  /* ── Safe tile revealed: bright gem "pop" ── */
  const playTileReveal = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      // Short ascending sine pop
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(820, t + 0.06);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.11);

      // Crisp overtone
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(1040, t);
      osc2.frequency.exponentialRampToValueAtTime(1600, t + 0.05);
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.06, t + 0.005);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc2.connect(g2); g2.connect(ctx.destination);
      osc2.start(t); osc2.stop(t + 0.09);
    } catch { /* ignore */ }
  }, []);

  /* ── Mine hit: low boom + explosion noise ── */
  const playMineHit = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;

      // Boom — low sine drop
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.35);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.42);

      // Explosion noise burst
      const src = ctx.createBufferSource();
      src.buffer = mkNoise(ctx, 0.3);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      src.connect(lp); lp.connect(ng); ng.connect(ctx.destination);
      src.start(t); src.stop(t + 0.32);

      // High crackle (adds texture)
      const src2 = ctx.createBufferSource();
      src2.buffer = mkNoise(ctx, 0.12);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 3000;
      const ng2 = ctx.createGain();
      ng2.gain.setValueAtTime(0.2, t);
      ng2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src2.connect(hp); hp.connect(ng2); ng2.connect(ctx.destination);
      src2.start(t); src2.stop(t + 0.13);
    } catch { /* ignore */ }
  }, []);

  /* ── Cashout win: ascending chord ── */
  const playCashout = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
      notes.forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.09;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.3);

        // Bright overtone
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.value = freq * 2;
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(0.06, t + 0.008);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc2.connect(g2); g2.connect(ctx.destination);
        osc2.start(t); osc2.stop(t + 0.22);
      });
    } catch { /* ignore */ }
  }, []);

  return { playPlaceBet, playTileReveal, playMineHit, playCashout };
}
