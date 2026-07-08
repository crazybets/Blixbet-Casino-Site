import { useRef, useCallback } from "react";

function getCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext | null {
  if (!ref.current) {
    try { ref.current = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  }
  if (ref.current.state === "suspended") ref.current.resume();
  return ref.current;
}

function isMuted(): boolean {
  return localStorage.getItem("blixbet_muted") === "true";
}

export function useSpinWheelSounds() {
  const acRef = useRef<AudioContext | null>(null);
  const tickTimers = useRef<number[]>([]);
  const activeNodes = useRef<{ stop: () => void }[]>([]);

  const stopAll = useCallback(() => {
    tickTimers.current.forEach(t => clearTimeout(t));
    tickTimers.current = [];
    activeNodes.current.forEach(n => { try { n.stop(); } catch {} });
    activeNodes.current = [];
  }, []);

  const playTick = useCallback((volume: number = 0.13, pitch: number = 1.0) => {
    if (isMuted()) return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1200 * pitch;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(volume, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    } catch {}
  }, []);

  const playSpinLoop = useCallback((segmentCount: number, durationMs: number = 4200) => {
    if (isMuted()) return;
    stopAll();

    const totalTicks = 5 * segmentCount + segmentCount;
    const durSec = durationMs / 1000;

    let elapsed = 0;
    for (let i = 0; i < totalTicks; i++) {
      const progress = i / totalTicks;
      const eased = 1 - Math.pow(1 - progress, 3);
      const interval = 25 + eased * 350;
      elapsed += interval;

      if (elapsed > durationMs - 80) break;

      const vol = 0.06 + (1 - eased) * 0.12;
      const pitch = 0.9 + (1 - eased) * 0.2;

      const timer = window.setTimeout(() => {
        playTick(vol, pitch);
      }, elapsed);
      tickTimers.current.push(timer);
    }

    const ctx = getCtx(acRef);
    if (ctx) {
      try {
        const t = ctx.currentTime;
        const endTick = ctx.createOscillator();
        const eg = ctx.createGain();
        endTick.type = "sine";
        endTick.frequency.value = 880;
        eg.gain.setValueAtTime(0, t + durSec - 0.05);
        eg.gain.linearRampToValueAtTime(0.1, t + durSec);
        eg.gain.exponentialRampToValueAtTime(0.001, t + durSec + 0.15);
        endTick.connect(eg);
        eg.connect(ctx.destination);
        endTick.start(t + durSec - 0.05);
        endTick.stop(t + durSec + 0.2);
        activeNodes.current.push(endTick);
      } catch {}
    }
  }, [playTick, stopAll]);

  const playWin = useCallback(() => {
    if (isMuted()) return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const nt = t + i * 0.1;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, nt);
        g.gain.linearRampToValueAtTime(0.18, nt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, nt + 0.3);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(nt);
        osc.stop(nt + 0.35);
      });

      const shimmer = ctx.createOscillator();
      const sg = ctx.createGain();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(2000, t + 0.35);
      shimmer.frequency.exponentialRampToValueAtTime(3500, t + 0.65);
      sg.gain.setValueAtTime(0, t + 0.35);
      sg.gain.linearRampToValueAtTime(0.03, t + 0.4);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      shimmer.connect(sg);
      sg.connect(ctx.destination);
      shimmer.start(t + 0.35);
      shimmer.stop(t + 0.7);
    } catch {}
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
      osc.frequency.setValueAtTime(350, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.25);
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);

      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(220, t + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(100, t + 0.35);
      g2.gain.setValueAtTime(0.1, t + 0.12);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.start(t + 0.12);
      osc2.stop(t + 0.45);
    } catch {}
  }, []);

  return { playSpinLoop, playWin, playLose, stopAll };
}
