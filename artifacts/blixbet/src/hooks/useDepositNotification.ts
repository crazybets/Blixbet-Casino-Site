import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBalanceQueryKey, getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { trackSocketIo, type WsStatus, type WsStats } from "@/lib/wsReconnect";

function getToken(): string | null {
  return localStorage.getItem("blixbet_token");
}

export function useDepositNotification() {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const lastSeenRef = useRef<Record<string, number>>({});
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [wsStats, setWsStats] = useState<WsStats | undefined>(undefined);
  const { data: user } = useGetMe();
  const userId = user?.id;

  useEffect(() => {
    const token = getToken();
    if (!token || !userId) return;

    if (socketRef.current?.connected) return;

    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      // Exponential backoff with jitter, capped at 30s.
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.3,
      // Bounded so a downed API doesn't make every open tab hammer
      // forever. After exhaustion the host UI surfaces a manual retry.
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;
    trackSocketIo("notifications", socket, (s, st) => { setWsStatus(s); setWsStats(st); });

    socket.on("deposit:confirmed", (data: { amount: number; currency: string; newBalance: number; paymentId?: string }) => {
      const dedupeKey = data.paymentId ?? `${data.amount}:${data.currency}`;
      const now = Date.now();
      const lastSeen = lastSeenRef.current[dedupeKey] ?? 0;
      if (now - lastSeen < 5000) return;
      lastSeenRef.current[dedupeKey] = now;

      queryClient.invalidateQueries({ queryKey: getGetBalanceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });

      window.dispatchEvent(new CustomEvent("blixbet:deposit", { detail: data }));
    });

    socket.on("wallet:balance_updated", () => {
      queryClient.invalidateQueries({ queryKey: getGetBalanceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    });

    socket.on("rain:received", (data: {
      eventId?: number;
      amount: number;
      rainType?: string;
      popup?: boolean;
      sound?: boolean;
      locked?: boolean;
      note?: string;
    }) => {
      queryClient.invalidateQueries({ queryKey: getGetBalanceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      window.dispatchEvent(new CustomEvent("blixbet:rain", { detail: data }));

      if (data.sound && !(window as any).__blixbet_muted) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const now = ctx.currentTime;
          // Two-tone chime
          [660, 990].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            const t = now + i * 0.12;
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
          });
        } catch { /* noop */ }
      }
    });

    socket.on("notification:new", (data: {
      id: number;
      type: string;
      title: string;
      message: string;
      priority: string;
      category: string;
      link: string | null;
      sound: boolean;
      sentAt: string;
    }) => {
      window.dispatchEvent(new CustomEvent("blixbet:notification", { detail: data }));

      if (data.sound) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.25);
        } catch { /* noop */ }
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  /**
   * Manual reconnect after the bounded reconnect attempts are exhausted.
   * socket.io's `connect()` resets the manager's internal counter, so
   * the user gets the full retry budget again.
   */
  const reconnect = useCallback(() => {
    const s = socketRef.current;
    if (!s) return;
    setWsStatus("connecting");
    if (s.connected) return;
    s.connect();
  }, []);

  return { wsStatus, wsStats, reconnect };
}
