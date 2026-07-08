import { useRef, useCallback, useEffect } from "react";

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

type ScratchNodes = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  lfo: OscillatorNode;
  bp: BiquadFilterNode;
  lfoGain: GainNode;
};

export function useScratchSounds() {
  const acRef = useRef<AudioContext | null>(null);
  const scratchNodesRef = useRef<ScratchNodes | null>(null);
  const isMuted = () => localStorage.getItem("blixbet_muted") === "true";

  const startScratchLoop = useCallback(() => {
    if (isMuted()) return;
    if (scratchNodesRef.current) return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const noiseBuf = mkNoise(ctx, 2);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2200;
      bp.Q.value = 0.8;

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 8;
      lfoGain.gain.value = 600;
      lfo.connect(lfoGain);
      lfoGain.connect(bp.frequency);
      lfo.start();

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.04);

      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start();

      scratchNodesRef.current = { source: src, gain: g, lfo, bp, lfoGain };
    } catch { /* ignore */ }
  }, []);

  const stopScratchLoop = useCallback(() => {
    const nodes = scratchNodesRef.current;
    if (!nodes) return;
    scratchNodesRef.current = null;
    const ctx = acRef.current;
    if (ctx) {
      try {
        nodes.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.06);
        setTimeout(() => {
          try { nodes.source.stop(); } catch { /* ignore */ }
          try { nodes.lfo.stop(); } catch { /* ignore */ }
          try { nodes.source.disconnect(); } catch { /* ignore */ }
          try { nodes.bp.disconnect(); } catch { /* ignore */ }
          try { nodes.gain.disconnect(); } catch { /* ignore */ }
          try { nodes.lfo.disconnect(); } catch { /* ignore */ }
          try { nodes.lfoGain.disconnect(); } catch { /* ignore */ }
        }, 80);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (scratchNodesRef.current) {
        try { scratchNodesRef.current.source.stop(); } catch { /* ignore */ }
        try { scratchNodesRef.current.lfo.stop(); } catch { /* ignore */ }
      }
      scratchNodesRef.current = null;
    };
  }, []);

  const playWinSound = useCallback(() => {
    if (isMuted()) return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;

      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const start = t + i * 0.08;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.2, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.36);

        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.value = freq * 2;
        g2.gain.setValueAtTime(0, start);
        g2.gain.linearRampToValueAtTime(0.05, start + 0.008);
        g2.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc2.connect(g2);
        g2.connect(ctx.destination);
        osc2.start(start);
        osc2.stop(start + 0.26);
      });

      const shimmer = t + 0.32;
      const src = ctx.createBufferSource();
      src.buffer = mkNoise(ctx, 0.25);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5000;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.12, shimmer);
      sg.gain.exponentialRampToValueAtTime(0.001, shimmer + 0.25);
      src.connect(hp);
      hp.connect(sg);
      sg.connect(ctx.destination);
      src.start(shimmer);
      src.stop(shimmer + 0.26);
    } catch { /* ignore */ }
  }, []);

  const playLoseSound = useCallback(() => {
    if (isMuted()) return;
    const ctx = getCtx(acRef);
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    } catch { /* ignore */ }
  }, []);

  return { startScratchLoop, stopScratchLoop, playWinSound, playLoseSound };
}
