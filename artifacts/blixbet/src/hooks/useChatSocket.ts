import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { trackSocketIo, type WsStatus, type WsStats } from "@/lib/wsReconnect";

export interface ChatMessage {
  id: number;
  userId: number | null;
  username: string;
  avatar: string | null;
  totalWagered: string;
  message: string;
  type: string;
  createdAt: string;
}

const BASE = import.meta.env.BASE_URL ?? "/";

function mergeMessages(
  existing: ChatMessage[],
  incoming: ChatMessage[],
  seenIds: Set<number>,
  deletedIds: Set<number>,
): ChatMessage[] {
  const merged = new Map<number, ChatMessage>();
  for (const m of existing) if (!deletedIds.has(m.id)) merged.set(m.id, m);
  for (const m of incoming) if (!deletedIds.has(m.id)) merged.set(m.id, m);
  const sorted = Array.from(merged.values()).sort((a, b) => a.id - b.id);
  const trimmed = sorted.length > 100 ? sorted.slice(sorted.length - 100) : sorted;
  seenIds.clear();
  for (const m of trimmed) seenIds.add(m.id);
  return trimmed;
}

async function fetchChatHistory(): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`${BASE}api/chat/messages?limit=50`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages ?? [];
  } catch {
    return [];
  }
}

export function useChatSocket() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [wsStats, setWsStats] = useState<WsStats | undefined>(undefined);
  const socketRef = useRef<Socket | null>(null);
  const seenIdsRef = useRef<Set<number>>(new Set());
  // Durable tombstone set: ids of messages this client has been told are
  // deleted. Persists across history merges so a stale `chat:history`
  // (e.g. on reconnect) cannot resurrect a moderated message.
  const deletedIdsRef = useRef<Set<number>>(new Set());
  const gotHistoryRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = io(window.location.origin + "/chat", {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      // Exponential backoff with jitter, capped at 30s — same shape as crash WS.
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.3,
      // Bounded so a flaky network or downed API doesn't have every open
      // tab hammering the server forever. After this cap socket.io fires
      // `reconnect_failed`, which trackSocketIo surfaces as `closed`, and
      // the chat header offers a manual "click to retry" affordance.
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;
    const tracker = trackSocketIo("chat", socket, (s, st) => { setWsStatus(s); setWsStats(st); });
    void tracker;

    fallbackTimerRef.current = setTimeout(async () => {
      if (!gotHistoryRef.current) {
        const history = await fetchChatHistory();
        if (history.length > 0 && !gotHistoryRef.current) {
          gotHistoryRef.current = true;
          setMessages(prev => mergeMessages(prev, history, seenIdsRef.current, deletedIdsRef.current));
        }
      }
    }, 3000);

    let isReconnect = false;
    socket.on("connect", () => {
      setConnected(true);
      // On reconnect, ask the server to re-send chat history so we don't miss
      // any messages that arrived while we were offline. The server's
      // chat:message dedupe (seenIdsRef) makes this idempotent.
      if (isReconnect) {
        socket.emit("chat:request-history");
        // Fallback: HTTP refetch in case the server doesn't honor the event.
        void fetchChatHistory().then(history => {
          if (history.length > 0) {
            setMessages(prev => mergeMessages(prev, history, seenIdsRef.current, deletedIdsRef.current));
          }
        });
      }
      isReconnect = true;
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("chat:history", (history: ChatMessage[]) => {
      gotHistoryRef.current = true;
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setMessages(prev => mergeMessages(prev, history, seenIdsRef.current, deletedIdsRef.current));
    });

    socket.on("chat:message", (msg: ChatMessage) => {
      if (seenIdsRef.current.has(msg.id)) return;
      // A late retransmit of an already-moderated message must not slip in.
      if (deletedIdsRef.current.has(msg.id)) return;
      seenIdsRef.current.add(msg.id);
      setMessages(prev => {
        const next = [...prev, msg];
        if (next.length > 100) {
          const removed = next.splice(0, next.length - 100);
          for (const r of removed) seenIdsRef.current.delete(r.id);
        }
        return next;
      });
    });

    // Admin moderation: a message was soft-deleted server-side. Drop it from
    // the rendered list immediately on every connected client and remember
    // the id so any stale chat:message / chat:history retransmit (e.g. on
    // reconnect history catch-up) cannot resurrect it.
    socket.on("chat:message_deleted", (payload: { id: number }) => {
      const id = payload?.id;
      if (typeof id !== "number") return;
      deletedIdsRef.current.add(id);
      setMessages(prev => prev.filter(m => m.id !== id));
    });

    // Admin moderation: this user's chat-mute state changed. We don't need to
    // mutate any state here — `useGetMe` is the source of truth for
    // chatMutedUntil and the input gate refetches it on send-failure. We
    // still listen so that future UI (e.g. real-time banner update) is easy
    // to wire in without changing the WS layer.
    socket.on("chat:user_muted", () => {
      // Intentionally a no-op for now; consumers can subscribe via window
      // event if they need finer-grained reaction. Keeping this handler
      // registered prevents the event name from being treated as unknown.
    });

    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const appendOptimistic = useCallback((msg: ChatMessage) => {
    if (seenIdsRef.current.has(msg.id)) return;
    seenIdsRef.current.add(msg.id);
    setMessages(prev => [...prev, msg]);
  }, []);

  /**
   * Manual reconnect, used when the bounded reconnect attempts have been
   * exhausted and the user explicitly clicks "retry". socket.io's
   * `connect()` resets the manager's internal attempt counter, so the
   * next failure cycle gets the full budget again.
   */
  const reconnect = useCallback(() => {
    const s = socketRef.current;
    if (!s) return;
    setWsStatus("connecting");
    if (s.connected) return;
    s.connect();
  }, []);

  return { messages, connected, wsStatus, wsStats, appendOptimistic, reconnect };
}
