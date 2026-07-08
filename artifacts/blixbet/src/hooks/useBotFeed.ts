import { useState, useEffect, useRef, useCallback } from "react";

// Weighted list — "slots" appears multiple times so the live feed shows
// regular slot activity alongside originals (matches the Slots picker on the
// homepage that lets users pick a Fiverscan slot to play).
const BOT_GAMES = [
  "crash","slides","dice","mines","towers","blackjack","chicken-cross","plinko","roulette",
  "slots","slots","slots","slots",
];

// A curated pool of real slot titles available through Fiverscan so bot rows
// in the live feed display a real game name (e.g. "Gates of Olympus") instead
// of just "slots". Provider-agnostic — the live feed only needs the label.
const SLOT_TITLES = [
  "Gates of Olympus", "Sweet Bonanza", "The Dog House", "Big Bass Bonanza",
  "Sugar Rush", "Wolf Gold", "Starlight Princess", "Joker's Jewels",
  "Fruit Party", "Wild West Gold", "Bonanza Billion", "Aviamasters",
  "Alien Fruits", "Merge Up", "Penny Pelican", "Hot Chilli Bells",
  "Monkey Warrior", "Pirate Gold", "Great Rhino", "Panda's Fortune",
  "Buffalo King", "Three Star Fortune", "Madame Destiny", "Drago Jewels",
  "Mustang Gold", "Reactoonz", "Book of Dead", "Big Bamboo",
];

function seededRng(seed: number) {
  return (offset: number) => {
    let h = seed + offset;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 0x100000000;
  };
}

function sRnd(rng: (o: number) => number, slot: number, min: number, max: number) {
  return rng(slot) * (max - min) + min;
}

const _WF = [
  "crim","quinn","rhy","konig","luna","jade","brook","nova","kai","rex","zane",
  "ash","dex","leo","finn","beau","lex","ace","rue","mel","sky","jay","blu","ted",
  "nix","tate","juno","kira","alex","cole","drew","wade","rhys","axel","cruz","ada",
  "cleo","ben","sam","jax","vex","zen","oak","fox","ray","del","mox","pix","sol",
  "kiss","leek","grow","uma","ori","imo","kel","pax","sev","tren","blix","coma",
];
const _WS = [
  "horn","solos","stey","lade","joel","mode","fall","pool","wave","king","wolf",
  "storm","blade","star","fire","gate","stone","peak","ridge","ford","moor","glen",
  "dale","lane","wood","field","shaw","mill","lock","drift","ward","croft","wick",
  "bourne","worth","luna","vale","mere","beck","burn","cross","well","holt",
];
const _WA = [
  "perpetual","dark","silent","hyper","alpha","nitro","omega","prime","turbo",
  "ultra","mega","neo","phantom","ghost","void","apex","zenith","flux","rapid",
  "quiet","lucky","harsh","fierce","solar","lunar","neon","digital","crystal",
];
const _WN = [
  "despair","hope","wolf","king","dragon","phoenix","hawk","raven","eagle","bear",
  "lion","tiger","shark","viper","cobra","storm","thunder","shadow","frost","blade",
  "pulse","drift","realm","quest","surge","hunter","seeker","warden","cipher",
];

function _sp<T>(arr: T[], rng: (o: number) => number, slot: number): T {
  return arr[Math.floor(rng(slot) * arr.length)];
}
function _uc(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function makeSeededName(rng: (o: number) => number, base: number): string {
  const r = rng(base);
  if (r < 0.14) {
    const s = (_sp(_WF, rng, base + 1) + _sp(_WS, rng, base + 2) + _sp(_WF, rng, base + 3)).toUpperCase();
    return s + (rng(base + 4) > 0.45 ? String(Math.floor(rng(base + 5) * 90) + 10) : "");
  }
  if (r < 0.28)
    return _sp(_WF, rng, base + 1) + (rng(base + 2) > 0.35 ? _sp(_WS, rng, base + 3) : "")
      + String(Math.floor(rng(base + 4) * 9000000) + 100);
  if (r < 0.40) return _uc(_sp(_WA, rng, base + 1)) + _uc(_sp(_WN, rng, base + 2));
  if (r < 0.54) {
    const c = _sp(_WF, rng, base + 1) + _sp(_WS, rng, base + 2);
    return rng(base + 3) > 0.6 ? _uc(c) : c;
  }
  if (r < 0.66)
    return _uc(_sp(_WF, rng, base + 1)) + _sp(_WS, rng, base + 2).charAt(0).toUpperCase()
      + String(Math.floor(rng(base + 3) * 99) + 1);
  if (r < 0.80) { const n = _sp(_WF, rng, base + 1); return rng(base + 2) > 0.5 ? _uc(n) : n; }
  return _sp(_WF, rng, base + 1) + String(Math.floor(rng(base + 2) * 90000) + 100);
}

export type BotEntry = {
  id: string;
  game: string;
  // Optional human label rendered in the live feed when the raw `game` slug
  // (e.g. "slots") doesn't carry enough info — slot bot rows set this to the
  // specific slot title so the table reads "Gates of Olympus" instead of
  // just "slots".
  gameLabel?: string;
  username: string;
  avatar: null;
  amount: number;
  multiplier: number;
  payout: number;
  time: string;
  _expiresAt: number;
  _isBot: true;
};

const SLOT_INTERVAL = 3000;
const ENTRY_TTL = 60_000;

function makeSlotEntry(slotIndex: number, subIndex: number, gameFilter?: string): BotEntry {
  const seed = slotIndex * 1000 + subIndex * 137;
  const rng = seededRng(seed);

  const game = gameFilter ?? BOT_GAMES[Math.floor(rng(10) * BOT_GAMES.length)];
  const r0 = rng(20);
  let amount: number;
  if (r0 < 0.45) amount = Math.round(sRnd(rng, 21, 0.50, 5.00) * 100) / 100;
  else if (r0 < 0.75) amount = Math.round(sRnd(rng, 21, 5.00, 25.00) * 100) / 100;
  else if (r0 < 0.92) amount = Math.round(sRnd(rng, 21, 25.0, 80.0) * 100) / 100;
  else amount = Math.round(sRnd(rng, 21, 80.0, 250.0) * 100) / 100;

  let won: boolean;
  let multiplier: number;

  if (game === "crash") {
    won = rng(30) > 0.25;
    if (won) {
      const cr = rng(31);
      if (cr < 0.35) multiplier = Math.round(sRnd(rng, 32, 1.06, 1.50) * 100) / 100;
      else if (cr < 0.55) multiplier = Math.round(sRnd(rng, 32, 1.50, 2.50) * 100) / 100;
      else if (cr < 0.72) multiplier = Math.round(sRnd(rng, 32, 2.50, 5.00) * 100) / 100;
      else if (cr < 0.86) multiplier = Math.round(sRnd(rng, 32, 5.00, 10.00) * 100) / 100;
      else if (cr < 0.95) multiplier = Math.round(sRnd(rng, 32, 10.0, 20.0) * 100) / 100;
      else multiplier = Math.round(sRnd(rng, 32, 20.0, 50.0) * 100) / 100;
    } else {
      multiplier = 0;
    }
  } else if (game === "slides") {
    won = rng(30) > 0.48;
    if (won) {
      multiplier = rng(31) < 0.19 ? 14 : 2;
    } else {
      multiplier = 0;
    }
  } else if (game === "plinko") {
    const plinkoMults = [0.2, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110];
    const plinkoWeights = [0.08, 0.12, 0.20, 0.22, 0.15, 0.10, 0.06, 0.04, 0.02, 0.01];
    const roll = rng(30);
    let cumulative = 0;
    let picked = 1;
    for (let i = 0; i < plinkoMults.length; i++) {
      cumulative += plinkoWeights[i];
      if (roll < cumulative) { picked = plinkoMults[i]; break; }
    }
    multiplier = picked;
    won = multiplier >= 1;
  } else if (game === "roulette") {
    const rr = rng(30);
    if (rr < 0.47) { won = true; multiplier = 2; }
    else if (rr < 0.50) { won = true; multiplier = 14; }
    else { won = false; multiplier = 0; }
  } else {
    won = rng(30) > 0.52;
    if (won) {
      const mr = rng(31);
      if (mr < 0.50) multiplier = Math.round(sRnd(rng, 32, 1.10, 3.00) * 100) / 100;
      else if (mr < 0.75) multiplier = Math.round(sRnd(rng, 32, 3.00, 6.00) * 100) / 100;
      else if (mr < 0.90) multiplier = Math.round(sRnd(rng, 32, 6.00, 12.00) * 100) / 100;
      else multiplier = Math.round(sRnd(rng, 32, 12.0, 30.0) * 100) / 100;
    } else {
      multiplier = 0;
    }
  }

  const payout = game === "plinko"
    ? Math.round(amount * multiplier * 100) / 100 - amount
    : won ? Math.round(amount * multiplier * 100) / 100 : -amount;

  const slotTime = slotIndex * SLOT_INTERVAL;

  const gameLabel =
    game === "slots"
      ? SLOT_TITLES[Math.floor(rng(60) * SLOT_TITLES.length)]
      : undefined;

  return {
    id: `bot_${slotIndex}_${subIndex}`,
    game,
    gameLabel,
    username: makeSeededName(rng, 50),
    avatar: null,
    amount,
    multiplier,
    payout,
    time: new Date(slotTime).toISOString(),
    _expiresAt: slotTime + ENTRY_TTL,
    _isBot: true,
  };
}

function buildEntriesForTime(now: number, gameFilter?: string, maxEntries = 15): BotEntry[] {
  const currentSlot = Math.floor(now / SLOT_INTERVAL);
  const slotsToShow = Math.ceil(ENTRY_TTL / SLOT_INTERVAL);
  const entries: BotEntry[] = [];

  for (let s = currentSlot; s > currentSlot - slotsToShow && entries.length < maxEntries * 2; s--) {
    const rng = seededRng(s * 7919);
    const count = rng(0) < 0.70 ? 1 : 2;
    for (let sub = 0; sub < count; sub++) {
      const entry = makeSlotEntry(s, sub, gameFilter);
      if (entry._expiresAt > now) {
        if (!gameFilter || entry.game === gameFilter) {
          entries.push(entry);
        }
      }
    }
  }

  return entries.slice(0, maxEntries);
}

export function useBotFeed(options?: { game?: string; maxEntries?: number; paused?: boolean }) {
  const { game, maxEntries = 15, paused = false } = options ?? {};
  const [entries, setEntries] = useState<BotEntry[]>(() => buildEntriesForTime(Date.now(), game, maxEntries));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const refresh = useCallback(() => {
    if (pausedRef.current) return;
    setEntries(buildEntriesForTime(Date.now(), game, maxEntries));
  }, [game, maxEntries]);

  useEffect(() => {
    if (paused) {
      // While paused (real feed is reconnecting / disconnected) we freeze the
      // bot generator entirely — existing entries will simply age out via their
      // _expiresAt TTL, which makes the feed visibly stale instead of faking
      // liveness with synthetic activity.
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    refresh();
    timerRef.current = setInterval(refresh, SLOT_INTERVAL);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [refresh, paused]);

  useEffect(() => {
    function handleCrashCashout(e: Event) {
      if (pausedRef.current) return;
      if (game && game !== "crash") return;
      const d = (e as CustomEvent<{ username: string; amount: number; multiplier: number; payout: number }>).detail;
      if (!d) return;
      const now = Date.now();
      const entry: BotEntry = {
        id: `crash_cashout_${now}_${Math.floor(Math.random() * 1e6)}`,
        game: "crash",
        username: d.username,
        avatar: null,
        amount: d.amount,
        multiplier: d.multiplier,
        payout: d.payout,
        time: new Date().toISOString(),
        _expiresAt: now + 45_000,
        _isBot: true,
      };
      setEntries(prev => [entry, ...prev].slice(0, maxEntries));
    }
    window.addEventListener("blixbet_crash_cashout", handleCrashCashout);
    return () => window.removeEventListener("blixbet_crash_cashout", handleCrashCashout);
  }, [game, maxEntries]);

  useEffect(() => {
    function handleSlidesEntries(e: Event) {
      if (pausedRef.current) return;
      if (game && game !== "slides") return;
      type RawEntry = { game: string; username: string; amount: number; multiplier: number; payout: number };
      const raw: RawEntry[] = (e as CustomEvent<RawEntry[]>).detail ?? [];
      const now = Date.now();
      const injected: BotEntry[] = raw.slice(0, 7).map((r, i) => ({
        id: `slides_result_${now}_${i}`,
        game: "slides",
        username: r.username,
        avatar: null,
        amount: r.amount,
        multiplier: r.multiplier,
        payout: r.payout,
        time: new Date().toISOString(),
        _expiresAt: now + 40_000,
        _isBot: true,
      }));
      setEntries(prev => [...injected, ...prev].slice(0, maxEntries));
    }
    window.addEventListener("blixbet_slides_entries", handleSlidesEntries);
    return () => window.removeEventListener("blixbet_slides_entries", handleSlidesEntries);
  }, [game, maxEntries]);

  return entries;
}
