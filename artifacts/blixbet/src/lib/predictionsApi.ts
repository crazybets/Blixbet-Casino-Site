const BASE = import.meta.env.BASE_URL;

function authHeaders(): Record<string, string> {
  let t: string | null = null;
  try { t = localStorage.getItem("blixbet_token"); } catch { /* noop */ }
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export interface PmOutcome { index: number; label: string; price: number; clobTokenId: string }

export interface PmMarket {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  groupTitle: string;
  icon: string;
  image: string;
  outcomes: PmOutcome[];
  volume: number;
  liquidity: number;
  endDate: string | null;
  closed: boolean;
  active: boolean;
  oneDayPriceChange: number;
}

export interface PmEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  image: string;
  volume: number;
  volume24hr: number;
  liquidity: number;
  endDate: string | null;
  closed: boolean;
  active: boolean;
  tags: string[];
  markets: PmMarket[];
}

export interface PredictionBet {
  id: number;
  eventSlug: string;
  eventTitle: string;
  marketId: string;
  question: string;
  outcome: string;
  outcomeIndex: number;
  amount: string;
  price: string;
  shares: string;
  potentialPayout: string;
  payout: string;
  status: "pending" | "won" | "lost" | "refunded";
  icon: string | null;
  endDate: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface Category { label: string; slug: string }

export interface PricePoint { t: number; p: number }

export interface PredictionActivity {
  id: string;
  user: string;
  side: "bought" | "sold";
  title: string;
  slug: string;
  outcome: string;
  price: number;
  value: number;
  icon: string | null;
  timestamp: number;
}

export interface PredictionComment {
  id: number;
  userId: number | null;
  body: string;
  createdAt: string;
  username: string | null;
}

async function jsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const b = await res.json(); if (b?.error) msg = b.error; } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchMarkets(category: string, signal?: AbortSignal): Promise<PmEvent[]> {
  const q = category ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(`${BASE}api/predictions/markets${q}`, { signal });
  const data = await jsonOrThrow(res);
  return data.events ?? [];
}

export async function fetchMarket(slug: string, signal?: AbortSignal): Promise<PmEvent> {
  const res = await fetch(`${BASE}api/predictions/markets/${encodeURIComponent(slug)}`, { signal });
  const data = await jsonOrThrow(res);
  return data.event;
}

export async function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  const res = await fetch(`${BASE}api/predictions/categories`, { signal });
  const data = await jsonOrThrow(res);
  return data.categories ?? [];
}

export async function fetchMyBets(signal?: AbortSignal): Promise<PredictionBet[]> {
  const res = await fetch(`${BASE}api/predictions/my-bets`, { headers: { ...authHeaders() }, signal });
  const data = await jsonOrThrow(res);
  return data.bets ?? [];
}

export async function placeBet(body: {
  eventSlug: string;
  marketId: string;
  outcomeIndex: number;
  amount: number;
}): Promise<{ bet: PredictionBet; balance: string }> {
  const res = await fetch(`${BASE}api/predictions/bet`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function fetchPriceHistory(
  slug: string,
  marketId: string,
  outcomeIndex: number,
  interval: string,
  signal?: AbortSignal,
): Promise<PricePoint[]> {
  const q = new URLSearchParams({ market: marketId, outcome: String(outcomeIndex), interval });
  const res = await fetch(`${BASE}api/predictions/markets/${encodeURIComponent(slug)}/history?${q}`, { signal });
  const data = await jsonOrThrow(res);
  return data.history ?? [];
}

export async function fetchActivity(limit = 60, signal?: AbortSignal): Promise<PredictionActivity[]> {
  const res = await fetch(`${BASE}api/predictions/activity?limit=${limit}`, { signal });
  const data = await jsonOrThrow(res);
  return data.trades ?? [];
}

export async function fetchComments(slug: string, signal?: AbortSignal): Promise<PredictionComment[]> {
  const res = await fetch(`${BASE}api/predictions/markets/${encodeURIComponent(slug)}/comments`, { signal });
  const data = await jsonOrThrow(res);
  return data.comments ?? [];
}

export async function postComment(eventSlug: string, body: string): Promise<PredictionComment> {
  const res = await fetch(`${BASE}api/predictions/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ eventSlug, body }),
  });
  const data = await jsonOrThrow(res);
  return data.comment;
}

export async function deleteComment(id: number): Promise<void> {
  const res = await fetch(`${BASE}api/predictions/comments/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  await jsonOrThrow(res);
}

/* ── formatting helpers ─────────────────────────────────────────────── */
export function fmtVolume(n: number): string {
  if (!n || n < 1) return "$0";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}b`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Signed percentage-point change, e.g. +7 / -3, from a 0-1 delta. */
export function fmtChange(delta: number): { text: string; up: boolean; flat: boolean } {
  const pts = Math.round(delta * 100);
  return { text: `${pts > 0 ? "+" : ""}${pts}%`, up: pts > 0, flat: pts === 0 };
}

export function fmtRelTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (isNaN(d)) return "";
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function cents(p: number): string {
  return `${Math.round(p * 100)}¢`;
}

/** The "Yes" / primary outcome price for a binary market. */
export function yesPrice(m: PmMarket): number {
  return m.outcomes[0]?.price ?? 0;
}

export function fmtEndDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
