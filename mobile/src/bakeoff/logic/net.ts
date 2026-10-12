export type NetMode = "ok" | "slow" | "offline" | "fail";
export type MenuState = "ok" | "loading" | "offline" | "fail";

export const parseNet = (s: string | undefined | null): NetMode => (s === "slow" || s === "offline" || s === "fail" ? s : "ok");

/**
 * M2 `menuState`: a place's menu on a day. Offline, today and tomorrow are saved (`day` 0 and 1); slow loads each place and day once
 * (`loaded` holds the "place|day" keys that have arrived).
 */
export function menuState(mode: NetMode, loaded: ReadonlySet<string>, key: string, day: number): MenuState {
  if (mode === "fail") return "fail";
  if (mode === "offline") return day <= 1 ? "ok" : "offline";
  return mode === "slow" && !loaded.has(key) ? "loading" : "ok";
}
