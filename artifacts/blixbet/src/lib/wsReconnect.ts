import { Socket } from "socket.io-client";

export type WsStatus = "connecting" | "open" | "reconnecting" | "closed";

interface BlixbetWindow {
  __blixbet_ws_stats?: () => Record<string, WsStats>;
}

export interface WsStats {
  attempts: number;
  totalReconnects: number;
  lastConnectedAt: number | null;
  lastEventAt: number | null;
  lastDisconnectedAt: number | null;
}

export interface ReconnectingWebSocketOptions {
  url: () => string;
  protocols?: string | string[];
  onOpen?: (ws: WebSocket, isReconnect: boolean, attempts: number) => void;
  onMessage?: (ev: MessageEvent) => void;
  onStatusChange?: (status: WsStatus, stats: WsStats) => void;
  onReconnect?: (attempts: number, ws: WebSocket) => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  name?: string;
}

const _statsRegistry = new Map<string, () => WsStats>();

function _ensureGlobal() {
  if (typeof window === "undefined") return;
  const w = window as Window & BlixbetWindow;
  if (!w.__blixbet_ws_stats) {
    w.__blixbet_ws_stats = () => {
      const out: Record<string, WsStats> = {};
      for (const [n, g] of _statsRegistry) out[n] = g();
      return out;
    };
  }
}

/** Public typed accessor for the global stats registry. */
export function getAllWsStats(): Record<string, WsStats> {
  if (typeof window === "undefined") return {};
  const w = window as Window & BlixbetWindow;
  return w.__blixbet_ws_stats?.() ?? {};
}

export function registerWsStats(name: string, getter: () => WsStats): void {
  _statsRegistry.set(name, getter);
  _ensureGlobal();
}

export class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private opts: ReconnectingWebSocketOptions;
  private attempts = 0;
  private totalReconnects = 0;
  private status: WsStatus = "connecting";
  private closedByUser = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastConnectedAt: number | null = null;
  private lastDisconnectedAt: number | null = null;
  private lastEventAt: number | null = null;

  constructor(opts: ReconnectingWebSocketOptions) {
    this.opts = opts;
    if (opts.name) registerWsStats(opts.name, () => this.getStats());
    this.connect();
  }

  private setStatus(s: WsStatus) {
    if (this.status === s) return;
    this.status = s;
    this.opts.onStatusChange?.(s, this.getStats());
  }

  private connect() {
    this.setStatus(this.attempts === 0 ? "connecting" : "reconnecting");
    let ws: WebSocket;
    try {
      ws = this.opts.protocols !== undefined
        ? new WebSocket(this.opts.url(), this.opts.protocols)
        : new WebSocket(this.opts.url());
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      const isReconnect = this.attempts > 0;
      const attempts = this.attempts;
      this.lastConnectedAt = Date.now();
      this.attempts = 0;
      this.setStatus("open");
      this.opts.onOpen?.(ws, isReconnect, attempts);
      if (isReconnect) {
        this.totalReconnects++;
        this.opts.onReconnect?.(attempts, ws);
        // Structured greppable log line.
        // eslint-disable-next-line no-console
        console.info(
          `[ws-reconnect] succeeded name=${this.opts.name ?? "ws"} attempts=${attempts} total=${this.totalReconnects}`
        );
      }
    };

    ws.onmessage = (ev) => {
      this.lastEventAt = Date.now();
      this.opts.onMessage?.(ev);
    };

    ws.onclose = () => {
      this.lastDisconnectedAt = Date.now();
      this.ws = null;
      if (this.closedByUser) {
        this.setStatus("closed");
        return;
      }
      this.scheduleRetry();
    };

    ws.onerror = () => { /* close will follow */ };
  }

  private scheduleRetry() {
    this.attempts += 1;
    const base = this.opts.baseDelayMs ?? 1000;
    const max = this.opts.maxDelayMs ?? 30000;
    const jr = this.opts.jitterRatio ?? 0.3;
    const exp = Math.min(max, base * Math.pow(2, this.attempts - 1));
    const jitter = exp * jr * (Math.random() * 2 - 1);
    const delay = Math.max(250, Math.round(exp + jitter));
    this.setStatus("reconnecting");
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      return true;
    }
    return false;
  }

  close(code?: number, reason?: string): void {
    this.closedByUser = true;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    try { this.ws?.close(code, reason); } catch { /* noop */ }
    this.setStatus("closed");
  }

  getStatus(): WsStatus { return this.status; }
  getStats(): WsStats {
    return {
      attempts: this.attempts,
      totalReconnects: this.totalReconnects,
      lastConnectedAt: this.lastConnectedAt,
      lastEventAt: this.lastEventAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
    };
  }
}

/**
 * Track a long-poll/refetch source under the same stats registry. Components
 * that use HTTP polling (LiveFeed, Slides) call `success()` after each
 * successful fetch and `error()` on each failure. Two consecutive failures
 * flips the indicator to `reconnecting`; recovery flips it back to `open`.
 */
export function trackPolling(
  name: string,
  onStatusChange?: (status: WsStatus, stats: WsStats) => void,
): { success: () => void; error: () => void; getStats: () => WsStats; getStatus: () => WsStatus } {
  let attempts = 0;
  let totalReconnects = 0;
  let consecutiveFailures = 0;
  let lastConnectedAt: number | null = null;
  let lastDisconnectedAt: number | null = null;
  let lastEventAt: number | null = null;
  let status: WsStatus = "connecting";

  const stats = (): WsStats => ({ attempts, totalReconnects, lastConnectedAt, lastEventAt, lastDisconnectedAt });
  const setStatus = (s: WsStatus) => { if (status !== s) { status = s; onStatusChange?.(s, stats()); } };

  registerWsStats(name, stats);

  return {
    success() {
      const wasDown = status === "reconnecting";
      consecutiveFailures = 0;
      lastConnectedAt = Date.now();
      lastEventAt = Date.now();
      if (wasDown) {
        totalReconnects++;
        // eslint-disable-next-line no-console
        console.info(`[ws-reconnect] succeeded name=${name} attempts=${attempts} total=${totalReconnects}`);
      }
      attempts = 0;
      setStatus("open");
    },
    error() {
      consecutiveFailures++;
      lastDisconnectedAt = Date.now();
      // First failure tolerated as a transient blip; second flips the dot.
      if (consecutiveFailures >= 2) {
        attempts++;
        setStatus("reconnecting");
      }
    },
    getStats: stats,
    getStatus: () => status,
  };
}

/**
 * Track a socket.io client so its reconnect stats appear in the same
 * `window.__blixbet_ws_stats()` registry as our raw-WebSocket clients.
 * socket.io has its own backoff, so we only observe and count.
 */
export function trackSocketIo(
  name: string,
  socket: Socket,
  onStatusChange?: (status: WsStatus, stats: WsStats) => void,
): { getStats: () => WsStats; getStatus: () => WsStatus } {
  let attempts = 0;
  let totalReconnects = 0;
  let lastConnectedAt: number | null = null;
  let lastDisconnectedAt: number | null = null;
  let lastEventAt: number | null = null;
  let status: WsStatus = "connecting";

  const stats = (): WsStats => ({ attempts, totalReconnects, lastConnectedAt, lastEventAt, lastDisconnectedAt });
  const setStatus = (s: WsStatus) => { if (status !== s) { status = s; onStatusChange?.(s, stats()); } };

  registerWsStats(name, stats);

  socket.on("connect", () => {
    if (attempts > 0) {
      totalReconnects++;
      // eslint-disable-next-line no-console
      console.info(`[ws-reconnect] succeeded name=${name} attempts=${attempts} total=${totalReconnects}`);
    }
    attempts = 0;
    lastConnectedAt = Date.now();
    setStatus("open");
  });

  // socket.io exposes the manager via socket.io
  const mgr = socket.io;
  if (mgr && typeof mgr.on === "function") {
    mgr.on("reconnect_attempt", () => { attempts++; setStatus("reconnecting"); });
  }

  socket.on("disconnect", () => {
    lastDisconnectedAt = Date.now();
    setStatus("reconnecting");
  });

  // socket.io's manager fires `reconnect_failed` when reconnectionAttempts
  // is exhausted. We surface this as `closed` so the UI can show a manual
  // "Retry" affordance instead of leaving the user staring at a stuck
  // "reconnecting…" spinner forever.
  if (mgr && typeof mgr.on === "function") {
    mgr.on("reconnect_failed", () => {
      lastDisconnectedAt = Date.now();
      setStatus("closed");
    });
  }

  socket.onAny(() => { lastEventAt = Date.now(); });

  return { getStats: stats, getStatus: () => status };
}
