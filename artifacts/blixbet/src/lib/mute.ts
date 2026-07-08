export const MUTE_KEY = "blixbet_muted";

export function isSiteMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === "true";
}
