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

export function useDiceSounds() {
  const acRef = useRef<AudioContext | null>(null);

  /* ── Dice rattle: 5 rapid noise clicks ── */
  const playRoll = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const clicks = 5;
      for (let i = 0; i < clicks; i++) {
        const t = ctx.currentTime + i * 0.055;
        const src = ctx.createBufferSource();
        src.buffer = mkNoise(ctx, 0.04);
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 2200;
        const g = ctx.createGain();
        // Random slight pitch so each click sounds different
        src.playbackRate.value = 0.85 + Math.random() * 0.3;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.28 + Math.random() * 0.08, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        src.connect(hp); hp.connect(g); g.connect(ctx.destination);
        src.start(t); src.stop(t + 0.05);
      }
    } catch { /* ignore */ }
  }, []);

  /* ── Win: three ascending bright tones ── */
  const playWin = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
      notes.forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.10;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.25);

        // Overtone layer for brightness
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.value = freq * 2;
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(0.07, t + 0.008);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc2.connect(g2); g2.connect(ctx.destination);
        osc2.start(t); osc2.stop(t + 0.2);
      });
    } catch { /* ignore */ }
  }, []);

  /* ── Lose: short descending thud ── */
  const playLose = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;

      // Low thump
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.25);

      // Short noise hit
      const src = ctx.createBufferSource();
      src.buffer = mkNoise(ctx, 0.06);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.18, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      src.connect(lp); lp.connect(ng); ng.connect(ctx.destination);
      src.start(t); src.stop(t + 0.07);
    } catch { /* ignore */ }
  }, []);

  return { playRoll, playWin, playLose };
}
