import { useState, useEffect } from "react";
import { io, type Socket } from "socket.io-client";

interface GameConfig {
  minBet: number;
  maxBet: number;
  enabled: boolean;
  loaded: boolean;
}

interface CacheEntry {
  minBet: number;
  maxBet: number;
  enabled: boolean;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

type Listener = (cfg: { minBet: number; maxBet: number; enabled: boolean }) => void;
const listeners = new Map<string, Set<Listener>>();

function emitConfigUpdate(gameId: string, cfg: { minBet: number; maxBet: number; enabled: boolean }) {
  const set = listeners.get(gameId);
  if (!set) return;
  for (const fn of set) {
    try { fn(cfg); } catch { /* ignore listener errors */ }
  }
}

let _socket: Socket | null = null;
function ensureSocket(): void {
  if (_socket || typeof window === "undefined") return;
  // Connect to the public namespace — broadcast-only events that any visitor
  // can receive (no auth needed). Path matches the api-server's Socket.IO mount.
  _socket = io(`${window.location.origin}/public`, {
    path: "/api/socket.io",
    transports: ["websocket", "polling"],
    reconnection: true,
  });
  _socket.on("game:config_updated", (data: { gameId: string; minBet: number; maxBet: number; enabled: boolean }) => {
    if (!data || typeof data.gameId !== "string") return;
    cache.set(data.gameId, { minBet: data.minBet, maxBet: data.maxBet, enabled: data.enabled, ts: Date.now() });
    emitConfigUpdate(data.gameId, { minBet: data.minBet, maxBet: data.maxBet, enabled: data.enabled });
  });
}

export function useGameConfig(gameId: string): GameConfig {
  const [cfg, setCfg] = useState<GameConfig>(() => {
    const c = cache.get(gameId);
    if (c && Date.now() - c.ts < CACHE_TTL) return { minBet: c.minBet, maxBet: c.maxBet, enabled: c.enabled, loaded: true };
    return { minBet: 0.10, maxBet: 10000, enabled: true, loaded: false };
  });

  useEffect(() => {
    ensureSocket();

    let cancelled = false;

    // Subscribe to live updates so admin edits to min/max bet propagate
    // immediately without waiting for the cache to expire or for a refetch.
    const onUpdate: Listener = (next) => {
      if (cancelled) return;
      setCfg({ minBet: next.minBet, maxBet: next.maxBet, enabled: next.enabled, loaded: true });
    };
    let set = listeners.get(gameId);
    if (!set) { set = new Set(); listeners.set(gameId, set); }
    set.add(onUpdate);

    const cached = cache.get(gameId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setCfg({ minBet: cached.minBet, maxBet: cached.maxBet, enabled: cached.enabled, loaded: true });
    } else {
      fetch(`/api/games/config/${gameId}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d || cancelled) return;
          const entry = { minBet: d.minBet, maxBet: d.maxBet, enabled: d.enabled, ts: Date.now() };
          cache.set(gameId, entry);
          setCfg({ ...entry, loaded: true });
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      const s = listeners.get(gameId);
      if (s) {
        s.delete(onUpdate);
        if (s.size === 0) listeners.delete(gameId);
      }
    };
  }, [gameId]);

  return cfg;
}

export function betValidationError(amount: number, cfg: GameConfig, balance: number): string | null {
  if (isNaN(amount) || amount <= 0) return "Enter a valid bet amount";
  if (cfg.loaded && amount < cfg.minBet) return `Minimum bet is ${cfg.minBet.toFixed(2)} B$`;
  if (cfg.loaded && amount > cfg.maxBet) return `Maximum bet is ${cfg.maxBet.toFixed(2)} B$`;
  if (amount > balance) return "Insufficient balance";
  return null;
}
