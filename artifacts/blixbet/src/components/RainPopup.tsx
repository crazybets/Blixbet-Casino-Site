import { useEffect, useRef, useState } from "react";

type RainEvent = {
  eventId?: number;
  amount: number;
  rainType?: string;
  popup?: boolean;
  locked?: boolean;
  note?: string;
};

export function RainPopup() {
  const [event, setEvent] = useState<RainEvent | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<RainEvent>).detail;
      if (!detail || !detail.popup) return;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setEvent(detail);
      timerRef.current = window.setTimeout(() => {
        setEvent(null);
        timerRef.current = null;
      }, 6000);
    };
    window.addEventListener("blixbet:rain", handler as EventListener);
    return () => {
      window.removeEventListener("blixbet:rain", handler as EventListener);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  if (!event) return null;

  const amt = Number(event.amount || 0);

  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10000,
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        aria-label="Dismiss rain notification"
        onClick={() => setEvent(null)}
        style={{
          background: "linear-gradient(135deg, #1e2347 0%, #2a3470 100%)",
          border: "2px solid #4D7CFE",
          borderRadius: 14,
          padding: "16px 22px",
          minWidth: 300,
          boxShadow: "0 12px 40px rgba(77,124,254,0.35), 0 0 0 6px rgba(77,124,254,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          cursor: "pointer",
          animation: "blixbetRainIn .4s ease-out",
        }}
      >
        <div style={{ fontSize: 36 }} aria-hidden="true">🌧️</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#c5cae8", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            You caught the rain!
          </div>
          <div style={{ color: "#00c896", fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>
            +{amt.toFixed(2)} B$
          </div>
          {event.locked && (
            <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 2 }}>
              🔒 Bonus funds (wager to unlock)
            </div>
          )}
          {event.note && (
            <div style={{ color: "#8b96c8", fontSize: 11, marginTop: 2 }}>{event.note}</div>
          )}
        </div>
        <span aria-hidden="true" style={{ color: "#8b96c8", fontSize: 16, padding: "4px 8px" }}>✕</span>
      </button>
      <style>{`
        @keyframes blixbetRainIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default RainPopup;
