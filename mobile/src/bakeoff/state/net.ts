import { useEffect, useSyncExternalStore } from "react";
import { loadFixtureAsync } from "../logic/fixture";
import { menuState, parseNet, type MenuState, type NetMode } from "../logic/net";
import type { PlaceKey } from "../logic/types";

/** What the network has done (M2 `NET`, `hallsLoaded`, `LOADED`): the mode, whether Halls' hours and busy have arrived, and the "place|day" menus that have. */
export interface Net { mode: NetMode; halls: "loading" | "ready"; loaded: ReadonlySet<string> }

const initial = (mode: NetMode): Net => ({ mode, halls: mode === "slow" ? "loading" : "ready", loaded: new Set() });
let net = initial(parseNet(process.env.EXPO_PUBLIC_BAKEOFF_NET));
let started = false, run = 0;
const pending = new Set<string>();
const listeners = new Set<() => void>();
const set = (n: Net) => { net = n; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** M2 `hoursKnown`: hours are cached for the day, so only a failure or the first slow load leaves them unknown. */
export const hoursKnown = (n: Net): boolean => n.mode !== "fail" && n.halls === "ready";
/** M2 `liveKnown`: busy is live and never shown stale, so offline and failed have none. */
export const liveKnown = (n: Net): boolean => (n.mode === "ok" || n.mode === "slow") && n.halls === "ready";

/** Starts a mode over (the env's at launch, a dev `net=` param later): slow loads Halls' hours and busy once, through `loadFixtureAsync`. */
export function startNet(mode: NetMode) {
  started = true;
  const mine = ++run;
  pending.clear();
  set(initial(mode));
  if (mode === "slow") loadFixtureAsync("slow").then(() => { if (mine === run) set({ ...net, halls: "ready" }); }, () => {});
}
/** Launch: begin the mode the store was created with, once. */
export const ensureNet = (mode?: NetMode) => { if (!started || (mode && mode !== net.mode)) startNet(mode ?? net.mode); };

/** Try again (M2 `retry`): fetch again; the fetch now succeeds, so every screen leaves its failure at once. */
export function retry() {
  const mine = run;
  return loadFixtureAsync("ok").then(() => { if (mine === run) startNet("ok"); });
}

function request(key: string) {
  if (pending.has(key)) return;
  pending.add(key);
  const mine = run;
  loadFixtureAsync(net.mode).then(() => { if (mine === run) set({ ...net, loaded: new Set(net.loaded).add(key) }); }, () => {});
}

export const getNet = (): Net => net;
export const useNet = (): Net => useSyncExternalStore(subscribe, () => net, () => net);
/** A place's menu on a day; a slow one starts its load when it is first asked for. */
export function useMenuState(place: PlaceKey, day: number): MenuState {
  const n = useNet(), key = `${place}|${day}`, st = menuState(n.mode, n.loaded, key, day);
  useEffect(() => { if (st === "loading") request(key); }, [st, key]);
  return st;
}
