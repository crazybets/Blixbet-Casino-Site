import { useEffect, useState, type CSSProperties } from "react";
import type { WsStatus, WsStats } from "@/lib/wsReconnect";

function formatAgo(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

export interface ConnectionIndicatorProps {
  status: WsStatus;
  stats?: WsStats;
  label?: string;
  showText?: boolean;
  style?: CSSProperties;
  /**
   * Optional manual reconnect callback. When provided AND the status is
   * `closed` (e.g. socket gave up after the bounded reconnect attempts),
   * the indicator becomes a clickable "Retry" affordance.
   */
  onRetry?: () => void;
}

export function ConnectionIndicator({
  status,
  stats,
  label,
  showText = true,
  style,
  onRetry,
}: ConnectionIndicatorProps) {
  const [, force] = useState(0);
  // Re-render every 10s so the "last event" tooltip stays fresh.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  const color =
    status === "open" ? "#22c55e" :
    status === "reconnecting" || status === "connecting" ? "#f59e0b" :
    "#ef4444";

  const gaveUp = status === "closed" && !!onRetry;
  const text =
    status === "open" ? "Connected" :
    status === "connecting" ? "Connecting…" :
    status === "reconnecting"
      ? `Reconnecting${stats && stats.attempts > 0 ? ` (#${stats.attempts})` : "…"}`
      : gaveUp ? "Disconnected — click to retry" : "Disconnected";

  const last = stats?.lastEventAt;
  const ago = last ? formatAgo(Date.now() - last) : null;
  const title =
    `${label ?? "Connection"}: ${text}` +
    (ago ? `\nLast event: ${ago} ago` : "\nNo events yet") +
    (stats && stats.totalReconnects > 0 ? `\nReconnects: ${stats.totalReconnects}` : "");

  const dot = (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
        boxShadow: status === "open" ? "0 0 6px rgba(34,197,94,.55)" : undefined,
        flexShrink: 0,
      }}
    />
  );

  const baseStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "#9aa3c7",
    ...style,
  };

  if (gaveUp && onRetry) {
    return (
      <button
        type="button"
        title={title}
        onClick={onRetry}
        aria-label={`${label ?? "Connection"} disconnected — click to retry`}
        style={{
          ...baseStyle,
          background: "transparent",
          border: "1px solid rgba(239,68,68,0.4)",
          padding: "2px 8px",
          borderRadius: 999,
          cursor: "pointer",
          color: "#fca5a5",
        }}
      >
        {dot}
        {showText && <span>{text}</span>}
      </button>
    );
  }

  return (
    <span title={title} style={baseStyle}>
      {dot}
      {showText && <span>{text}</span>}
    </span>
  );
}
