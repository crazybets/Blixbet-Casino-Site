import React from "react";

export type ResultKind = "win" | "lose" | "bust" | "push" | "blackjack" | "cashout" | "tower-win";

interface GameResultPopupProps {
  kind: ResultKind;
  amount: number;
  label?: string;
  sub?: string;
}

const THEME: Record<ResultKind, { color: string; bg: string; label: string; sign: string }> = {
  win:       { color: "#4ade80", bg: "rgba(74,222,128,0.10)",   label: "WIN!",          sign: "+" },
  cashout:   { color: "#4ade80", bg: "rgba(74,222,128,0.10)",   label: "CASHED OUT",    sign: "+" },
  "tower-win":{ color: "#4ade80", bg: "rgba(74,222,128,0.10)", label: "TOWER CLEARED!", sign: "+" },
  blackjack: { color: "#fbbf24", bg: "rgba(251,191,36,0.10)",   label: "BLACKJACK!",    sign: "+" },
  push:      { color: "#60a5fa", bg: "rgba(96,165,250,0.10)",   label: "PUSH",          sign: ""  },
  lose:      { color: "#f87171", bg: "rgba(248,113,113,0.10)",  label: "LOSE",          sign: "-" },
  bust:      { color: "#f87171", bg: "rgba(248,113,113,0.10)",  label: "BUST!",         sign: "-" },
};

export default function GameResultPopup({ kind, amount, label, sub }: GameResultPopupProps) {
  const t = THEME[kind];
  const displayLabel = label ?? t.label;

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 40, pointerEvents: "none",
    }}>
      <style>{`
        @keyframes grp-in {
          0%   { transform: scale(0.72) translateY(6px); opacity: 0; }
          65%  { transform: scale(1.04) translateY(-2px); opacity: 1; }
          100% { transform: scale(1)    translateY(0);    opacity: 1; }
        }
      `}</style>
      <div style={{
        background: "#12173a",
        border: `1px solid ${t.color}33`,
        borderRadius: 18,
        padding: "18px 44px 20px",
        textAlign: "center",
        boxShadow: `0 12px 48px rgba(0,0,0,0.65), 0 0 0 1px ${t.color}18 inset`,
        animation: "grp-in 0.3s cubic-bezier(0.22,1,0.36,1) forwards",
        minWidth: 200,
      }}>
        {/* Coloured result pill */}
        <div style={{
          display: "inline-block",
          background: t.bg,
          border: `1px solid ${t.color}`,
          borderRadius: 99,
          padding: "3px 14px",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          color: t.color,
          marginBottom: 10,
          textTransform: "uppercase",
        }}>{displayLabel}</div>

        {/* Amount */}
        <div style={{
          fontSize: 42,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1,
          letterSpacing: "-0.02em",
          marginBottom: 4,
        }}>
          {t.sign}{amount.toFixed(2)} B$
        </div>

        {/* Optional secondary line */}
        {sub && (
          <div style={{ fontSize: 13, fontWeight: 600, color: t.color }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
