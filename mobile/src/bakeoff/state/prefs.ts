import { useSyncExternalStore } from "react";
import { NO_PREFS, type Prefs } from "../logic/menuView";

/** You's "Show on dishes" toggles: a dish row draws a score only when its toggle is on (and the dish has that score). */
export interface Toggles { health: boolean; carbon: boolean }
export interface BakeoffState { prefs: Prefs; scores: Toggles }

const INITIAL: BakeoffState = { prefs: NO_PREFS, scores: { health: false, carbon: false } };

// ponytail: in memory only. Task 7 adds persistence (and You's UI) on top of this same store.
let state = INITIAL;
const listeners = new Set<() => void>();

export const getBakeoffState = () => state;
export function setBakeoffState(patch: Partial<BakeoffState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const resetBakeoffState = () => setBakeoffState(INITIAL);
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useBakeoffState = () => useSyncExternalStore(subscribe, getBakeoffState, getBakeoffState);

/**
 * Dev-only: seed the store from a route's query for screenshots (`bakeoff?diet=veg,halal&avoid=Milk,Soy&scores=health,carbon`).
 * Does nothing outside __DEV__ and never reads the query it doesn't know.
 */
export function applyDevParams(q: Record<string, string | string[] | undefined>) {
  if (!__DEV__) return;
  const list = (k: string) => (typeof q[k] === "string" && q[k] ? (q[k] as string).split(",") : []);
  if (!("diet" in q) && !("avoid" in q) && !("scores" in q)) return;
  const diet = list("diet"), scores = list("scores");
  setBakeoffState({
    prefs: { veg: diet.includes("veg"), plant: diet.includes("plant"), halal: diet.includes("halal"), avoid: list("avoid") },
    scores: { health: scores.includes("health"), carbon: scores.includes("carbon") },
  });
}
