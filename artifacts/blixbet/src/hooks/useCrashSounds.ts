import { useRef, useCallback, useEffect } from "react";

function getCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

export function useCrashSounds() {
  const ctxRef  = useRef<AudioContext | null>(null);
  const engineRef = useRef<any>(null);
  const mutedRef  = useRef(false);

  const ctx = useCallback((): AudioContext | null => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = getCtx();
    }
    if (ctxRef.current?.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  // ── Countdown tick — soft, low, muted click ─────────────────────────────
  const playTick = useCallback(() => {
    if (mutedRef.current || localStorage.getItem("blixbet_muted") === "true") return;
    const ac = ctx();
    if (!ac) return;
    const t = ac.currentTime;

    // Gentle sine tone at 440 Hz — warm, not piercing
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.10, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }, [ctx]);

  // ── Rocket launch — gentle ascending whoosh with sine sweep ────────────
  const playLaunch = useCallback(() => {
    if (mutedRef.current || localStorage.getItem("blixbet_muted") === "true") return;
    const ac = ctx();
    if (!ac) return;
    const t = ac.currentTime;

    // Soft noise whoosh
    const bufLen = ac.sampleRate * 0.4;
    const buf    = ac.createBuffer(1, bufLen, ac.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src    = ac.createBufferSource();
    src.buffer   = buf;
    const filter = ac.createBiquadFilter();
    filter.type  = "bandpass";
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.4);
    filter.Q.value = 1.2;
    const gain  = ac.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(t);
    src.stop(t + 0.42);

    // Warm rising sine — not sawtooth
    const osc  = ac.createOscillator();
    const tGain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.4);
    tGain.gain.setValueAtTime(0.14, t);
    tGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(tGain);
    tGain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.42);
  }, [ctx]);

  // ── Engine loop — warm, deep rocket rumble with no harsh frequencies ────
  const startEngine = useCallback((getMultiplier: () => number) => {
    if (mutedRef.current || localStorage.getItem("blixbet_muted") === "true") return;
    stopEngine();
    const ac = ctx();
    if (!ac) return;

    // Pink noise buffer (Paul Kellett algorithm)
    const sr  = ac.sampleRate;
    const buf = ac.createBuffer(1, sr * 3, sr);
    const d   = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759;
      b2 = 0.96900*b2 + w*0.1538520; b3 = 0.86650*b3 + w*0.3104856;
      b4 = 0.55000*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.0168980;
      d[i] = (b0+b1+b2+b3+b4+b5 + w*0.5362) * 0.11;
    }

    // Channel 1: low rumble body — wide bandpass, warm centre
    const rumbleSrc  = ac.createBufferSource();
    rumbleSrc.buffer = buf; rumbleSrc.loop = true;
    const rumbleFilt = ac.createBiquadFilter();
    rumbleFilt.type  = "bandpass"; rumbleFilt.frequency.value = 130; rumbleFilt.Q.value = 0.5;
    const rumbleGain = ac.createGain(); rumbleGain.gain.value = 0;
    rumbleSrc.connect(rumbleFilt);
    rumbleFilt.connect(rumbleGain);
    rumbleGain.connect(ac.destination);
    rumbleSrc.start();
    rumbleGain.gain.linearRampToValueAtTime(0.22, ac.currentTime + 0.9);

    // Channel 2: warm mid breath — lowpass instead of harsh highpass
    // Keeps warmth without any shrill hiss
    const midSrc  = ac.createBufferSource();
    midSrc.buffer = buf; midSrc.loop = true; midSrc.loopStart = 0.9;
    const midFilt = ac.createBiquadFilter();
    midFilt.type  = "bandpass"; midFilt.frequency.value = 700; midFilt.Q.value = 0.6;
    const midGain = ac.createGain(); midGain.gain.value = 0;
    midSrc.connect(midFilt);
    midFilt.connect(midGain);
    midGain.connect(ac.destination);
    midSrc.start();
    midGain.gain.linearRampToValueAtTime(0.04, ac.currentTime + 1.2);

    // Channel 3: sub-bass sine tone for warmth and depth
    const subOsc  = ac.createOscillator();
    const subGain = ac.createGain();
    subOsc.type   = "sine";
    subOsc.frequency.value = 55;
    subGain.gain.value = 0;
    subOsc.connect(subGain);
    subGain.connect(ac.destination);
    subOsc.start();
    subGain.gain.linearRampToValueAtTime(0.08, ac.currentTime + 1.0);

    // Animate: multiplier climb gradually raises warmth
    const interval = window.setInterval(() => {
      try {
        if (!engineRef.current) { clearInterval(interval); return; }
        const m = getMultiplier();
        rumbleFilt.frequency.value = Math.min(130 + (m - 1) * 10, 260);
        const vol = Math.min(0.22 + (m - 1) * 0.005, 0.32);
        rumbleGain.gain.setTargetAtTime(vol, ac.currentTime, 0.4);
        midGain.gain.setTargetAtTime(Math.min(0.04 + (m - 1) * 0.002, 0.08), ac.currentTime, 0.6);
        subOsc.frequency.setTargetAtTime(Math.min(55 + (m - 1) * 2, 80), ac.currentTime, 0.5);
      } catch { clearInterval(interval); }
    }, 350);

    engineRef.current = {
      osc: rumbleSrc,
      interval,
      _extra: { rumbleGain, midGain, subOsc, subGain, midSrc },
    };
  }, [ctx]);

  const stopEngine = useCallback(() => {
    const e = engineRef.current as any;
    if (!e) return;
    clearInterval(e.interval);
    const now    = ctxRef.current?.currentTime ?? 0;
    const stopAt = now + 0.4;
    try {
      e._extra?.rumbleGain?.gain.setTargetAtTime(0.001, now, 0.06);
      e._extra?.midGain?.gain.setTargetAtTime(0.001, now, 0.06);
      e._extra?.subGain?.gain.setTargetAtTime(0.001, now, 0.08);
      e.osc?.stop(stopAt);
      e._extra?.midSrc?.stop?.(stopAt);
      e._extra?.subOsc?.stop?.(stopAt);
    } catch {}
    engineRef.current = null;
  }, []);

  // ── Crash explosion — warm thump, no harsh square-wave cracks ──────────
  const playCrash = useCallback(() => {
    stopEngine();
    if (mutedRef.current || localStorage.getItem("blixbet_muted") === "true") return;
    const ac = ctx();
    if (!ac) return;
    const t = ac.currentTime;

    // Layer 1: deep sub-bass thump
    const kick     = ac.createOscillator();
    const kickGain = ac.createGain();
    kick.type = "sine";
    kick.frequency.setValueAtTime(120, t);
    kick.frequency.exponentialRampToValueAtTime(30, t + 0.18);
    kickGain.gain.setValueAtTime(0, t);
    kickGain.gain.linearRampToValueAtTime(0.9, t + 0.004);
    kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    kick.connect(kickGain);
    kickGain.connect(ac.destination);
    kick.start(t);
    kick.stop(t + 0.46);

    // Layer 2: triangle mid-crack — warm, not harsh square
    const crack     = ac.createOscillator();
    const crackGain = ac.createGain();
    crack.type = "triangle";
    crack.frequency.setValueAtTime(280, t);
    crack.frequency.exponentialRampToValueAtTime(60, t + 0.09);
    crackGain.gain.setValueAtTime(0, t);
    crackGain.gain.linearRampToValueAtTime(0.35, t + 0.003);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    crack.connect(crackGain);
    crackGain.connect(ac.destination);
    crack.start(t);
    crack.stop(t + 0.13);

    // Layer 3: noise body — low-mid only, no high-freq harshness
    const bufLen = ac.sampleRate * 0.65;
    const buf    = ac.createBuffer(1, bufLen, ac.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    // Warm low rumble tail (400 Hz lowpass)
    const src1   = ac.createBufferSource();
    src1.buffer  = buf;
    const loFilt = ac.createBiquadFilter();
    loFilt.type  = "lowpass"; loFilt.frequency.value = 400;
    const loGain = ac.createGain();
    loGain.gain.setValueAtTime(0.5, t);
    loGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src1.connect(loFilt); loFilt.connect(loGain); loGain.connect(ac.destination);
    src1.start(t); src1.stop(t + 0.62);

    // Soft mid body (800 Hz bandpass — warm, not sharp)
    const src2    = ac.createBufferSource();
    src2.buffer   = buf;
    const midFilt = ac.createBiquadFilter();
    midFilt.type  = "bandpass"; midFilt.frequency.value = 800; midFilt.Q.value = 0.7;
    const midGain = ac.createGain();
    midGain.gain.setValueAtTime(0.25, t);
    midGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src2.connect(midFilt); midFilt.connect(midGain); midGain.connect(ac.destination);
    src2.start(t); src2.stop(t + 0.20);
  }, [ctx, stopEngine]);

  // ── Cash-out cha-ching — warm ascending coins ──────────────────────────
  const playCashout = useCallback(() => {
    if (mutedRef.current || localStorage.getItem("blixbet_muted") === "true") return;
    const ac = ctx();
    if (!ac) return;
    const t = ac.currentTime;

    // Three ascending warm tones (lower than before, with gentler envelope)
    [0, 0.10, 0.20].forEach((delay, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = 660 + i * 165; // C5, E5, G5 — pleasant chord arpeggio
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.18, t + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.32);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.34);

      // Harmonic overtone for richness
      const osc2  = ac.createOscillator();
      const gain2 = ac.createGain();
      osc2.type = "sine";
      osc2.frequency.value = (660 + i * 165) * 2;
      gain2.gain.setValueAtTime(0, t + delay);
      gain2.gain.linearRampToValueAtTime(0.05, t + delay + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.2);
      osc2.connect(gain2);
      gain2.connect(ac.destination);
      osc2.start(t + delay);
      osc2.stop(t + delay + 0.22);
    });
  }, [ctx]);

  // ── Bet placed — soft, rounded click ──────────────────────────────────
  const playBetClick = useCallback(() => {
    if (mutedRef.current || localStorage.getItem("blixbet_muted") === "true") return;
    const ac = ctx();
    if (!ac) return;
    const t = ac.currentTime;
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = 360;
    gain.gain.setValueAtTime(0.10, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.11);
  }, [ctx]);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    if (muted) stopEngine();
  }, [stopEngine]);

  useEffect(() => {
    return () => {
      stopEngine();
      ctxRef.current?.close().catch(() => {});
    };
  }, [stopEngine]);

  return { playTick, playLaunch, startEngine, stopEngine, playCrash, playCashout, playBetClick, setMuted };
}
