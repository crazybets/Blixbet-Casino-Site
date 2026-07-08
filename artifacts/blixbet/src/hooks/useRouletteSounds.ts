import { useRef, useCallback } from "react";

function getCtx(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    return Ctx ? new Ctx() : null;
  } catch { return null; }
}

function resume(ctx: AudioContext) {
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

export function useRouletteSounds() {
  const ctxRef     = useRef<AudioContext | null>(null);
  const clicksRef  = useRef<ReturnType<typeof setTimeout>[]>([]);

  function ctx(): AudioContext | null {
    if (!ctxRef.current) ctxRef.current = getCtx();
    if (ctxRef.current) resume(ctxRef.current);
    return ctxRef.current;
  }

  // ── chip selected from chip row (UI tick) ────────────────────────
  // Soft, bright sine "tick" — distinct from the heavier on-table
  // placement sound so users can tell selection apart from placement.
  const playChipSelect = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    // Sine pop with a quick downward chirp — light, satisfying tick.
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.05);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(t + 0.08);
  }, []);

  // ── chip placed on table ─────────────────────────────────────────
  const playChipClick = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    g.connect(c.destination);

    const buf = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp   = c.createBiquadFilter();
    bp.type    = "bandpass";
    bp.frequency.value = 3200;
    bp.Q.value         = 0.8;
    src.connect(bp);
    bp.connect(g);
    src.start(t);
  }, []);

  // ── ball spinning around the track ──────────────────────────────
  // Schedules ~N clicks that decelerate over totalMs.
  // Uses bandpass noise + low sine, same recipe as slides _playSpinSound.
  const stopSpin = useCallback(() => {
    clicksRef.current.forEach(id => clearTimeout(id));
    clicksRef.current = [];
  }, []);

  const playSpinSound = useCallback((totalMs = 7500) => {
    stopSpin();
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const c = ctx(); if (!c) return;

    // Intervals: start fast (55 ms) → slow (700 ms) over totalMs
    const T0  = 55;
    const T1  = 700;
    const totalSec = totalMs / 1000;
    const k   = Math.log(T1 / T0) / totalSec;  // exponential growth constant

    let elapsed = 0;
    let delay   = T0;

    const scheduleNext = () => {
      if (elapsed >= totalMs) return;
      const id = setTimeout(() => {
        // play one click
        const ac = ctxRef.current; if (!ac) return;
        const t  = ac.currentTime;

        // noise burst (ball hitting peg)
        const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.025), ac.sampleRate);
        const ch  = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1);
        const nSrc = ac.createBufferSource();
        nSrc.buffer = buf;
        const bp    = ac.createBiquadFilter();
        bp.type     = "bandpass";
        bp.frequency.value = 1800 + Math.random() * 800;
        bp.Q.value         = 1.2;
        const ng = ac.createGain();
        ng.gain.setValueAtTime(0.18, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
        nSrc.connect(bp); bp.connect(ng); ng.connect(ac.destination);
        nSrc.start(t);

        // woody tone drop
        const osc = ac.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(260 + Math.random() * 60, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.025);
        const og = ac.createGain();
        og.gain.setValueAtTime(0.12, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
        osc.connect(og); og.connect(ac.destination);
        osc.start(t); osc.stop(t + 0.03);

        elapsed += delay;
        delay = T0 * Math.exp(k * (elapsed / 1000));
        scheduleNext();
      }, delay) as unknown as ReturnType<typeof setTimeout>;
      clicksRef.current.push(id);
    };

    scheduleNext();
  }, [stopSpin]);

  // ── ball drops into pocket ──────────────────────────────────────
  const playLandSound = useCallback(() => {
    stopSpin();
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const c = ctx(); if (!c) return;
    const t = c.currentTime;

    // heavy thud – low sine sweep down
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const og = c.createGain();
    og.gain.setValueAtTime(0.55, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(og); og.connect(c.destination);
    osc.start(t); osc.stop(t + 0.25);

    // noise layer
    const buf = c.createBuffer(1, c.sampleRate * 0.12, c.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const nSrc = c.createBufferSource();
    nSrc.buffer = buf;
    const lp   = c.createBiquadFilter();
    lp.type    = "lowpass";
    lp.frequency.value = 320;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    nSrc.connect(lp); lp.connect(ng); ng.connect(c.destination);
    nSrc.start(t);

    // two aftershock rattles
    [0.28, 0.46].forEach((dt, i) => {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(160 - i * 30, t + dt);
      o.frequency.exponentialRampToValueAtTime(50, t + dt + 0.07);
      const g = c.createGain();
      g.gain.setValueAtTime(0.18 - i * 0.06, t + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.08);
      o.connect(g); g.connect(c.destination);
      o.start(t + dt); o.stop(t + dt + 0.09);
    });
  }, [stopSpin]);

  // ── win chime – ascending major arpeggio ────────────────────────
  const playWinSound = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];  // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc  = c.createOscillator();
      const tri  = c.createOscillator();
      osc.type   = "sine";
      tri.type   = "triangle";
      osc.frequency.value = freq;
      tri.frequency.value = freq * 2;
      const g = c.createGain();
      const at = t + i * 0.10;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.22, at + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.55);
      osc.connect(g); tri.connect(g); g.connect(c.destination);
      osc.start(at); osc.stop(at + 0.6);
      tri.start(at); tri.stop(at + 0.6);
    });
  }, []);

  // ── lose thud – descending tone ─────────────────────────────────
  const playLoseSound = useCallback(() => {
    if (localStorage.getItem("blixbet_muted") === "true") return;
    const c = ctx(); if (!c) return;
    const t = c.currentTime;

    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(310, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.38);
    const g = c.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(t + 0.5);

    const buf = c.createBuffer(1, c.sampleRate * 0.08, c.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const nSrc = c.createBufferSource();
    nSrc.buffer = buf;
    const lp   = c.createBiquadFilter();
    lp.type    = "lowpass";
    lp.frequency.value = 280;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.2, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    nSrc.connect(lp); lp.connect(ng); ng.connect(c.destination);
    nSrc.start(t);
  }, []);

  return { playChipSelect, playChipClick, playSpinSound, playLandSound, playWinSound, playLoseSound, stopSpin };
}
