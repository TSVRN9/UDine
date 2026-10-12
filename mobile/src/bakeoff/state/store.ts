import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { dishKey, loadFixture, servingOn } from "../logic/fixture";
import { NO_PREFS, type Prefs } from "../logic/menuView";
import { addDish, emptyPlates, macroOf, plateHalls, stepItem, type Plate, type PlateItem, type PlateState } from "../logic/plate";
import type { Dish, MealKey, PlaceKey } from "../logic/types";

/** You's "Show on dishes" toggles: a dish row draws a score only when its toggle is on (and the dish has that score). */
export interface Toggles { health: boolean; carbon: boolean }
/** A logged item is a snapshot of what was eaten, so the log stays true whatever the feed does later (M2 `snapItem`). */
export interface LogItem { name: string; qty: number; cal: number; p: number; c: number; f: number }
export interface LogEntry { id: number; meal: MealKey; place: PlaceKey | null; items: LogItem[] }
/** The receipt: what Undo needs to put the plate back where it was. */
export interface Receipt { entry: LogEntry; plate: Plate; idx: number }
export interface State { plates: PlateState; prefs: Prefs; show: Toggles; newton: boolean; log: LogEntry[]; last: Receipt | null; /** plates of Charles River Campus set aside while its toggle is off */ off: Plate[] }

const KEY = "bakeoff.store.v1";
const OFF: Toggles = { health: false, carbon: false };
const INITIAL: State = { plates: emptyPlates, prefs: NO_PREFS, show: OFF, newton: false, log: [], last: null, off: [] };

let state = INITIAL;
const listeners = new Set<() => void>();
export const getState = () => state;
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
function set(patch: Partial<State>, persist = false) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (persist) save();
}
/** One store for the whole slice. A selector must return something stable (a primitive, or a part of the state). */
export const useStore = <T,>(select: (s: State) => T): T => useSyncExternalStore(subscribe, () => select(state), () => select(state));

// ---- persistence: what the device keeps between runs. The plate in progress is not kept (M2 keeps only favorites and diet).
// Device-only by design: the log is health data (CLAUDE.md, data residency). No server call anywhere in this file.
let writing: Promise<void> = Promise.resolve();
function save() {
  const { prefs, show, newton, log } = state;
  const json = JSON.stringify({ prefs, show, newton, log });
  writing = writing.then(() => AsyncStorage.setItem(KEY, json)).catch(() => {});
}
/** Resolves once every write so far has landed (tests, and a screen that must not race its own reload). */
export const flush = () => writing;

const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isItem = (v: any): v is LogItem => !!v && typeof v.name === "string" && ["qty", "cal", "p", "c", "f"].every((k) => isNum(v[k]));
const isEntry = (v: any): v is LogEntry => !!v && isNum(v.id) && typeof v.meal === "string" && (v.place === null || typeof v.place === "string") && Array.isArray(v.items) && v.items.every(isItem);

/** Read what was kept, field by field: a value that is not the right shape is left at its default. */
export const hydrate = (): Promise<void> => (hydrating ??= read());
let hydrating: Promise<void> | null = null;
async function read(): Promise<void> {
  let raw: any;
  try { raw = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "null"); } catch { return; }
  if (!raw || typeof raw !== "object") return;
  const p = raw.prefs, s = raw.show;
  set({
    prefs: p && isBool(p.veg) && isBool(p.plant) && isBool(p.halal) && Array.isArray(p.avoid) && p.avoid.every((a: unknown) => typeof a === "string") ? { veg: p.veg, plant: p.plant, halal: p.halal, avoid: p.avoid } : state.prefs,
    show: s && isBool(s.health) && isBool(s.carbon) ? { health: s.health, carbon: s.carbon } : state.show,
    newton: isBool(raw.newton) ? raw.newton : state.newton,
    log: Array.isArray(raw.log) && raw.log.every(isEntry) ? raw.log : state.log,
  });
}

// ---- actions
const clampFront = (front: number, n: number) => Math.max(0, Math.min(front, n - 1));

/** Add one of a dish to the plate it joins (or a new one): M2 `addDish`. A receipt still up goes away with it. */
export function add(meal: MealKey, name: string, refs: Partial<Record<PlaceKey, Dish>>, custom?: PlateItem["custom"]) {
  set({ plates: addDish(state.plates, meal, name, refs, custom), last: null });
}
export function step(plateId: number, key: string, dir: 1 | -1) {
  set({ plates: stepItem(state.plates, plateId, key, dir) });
}
export function setFront(i: number) {
  if (!state.plates.plates.length) return;
  const front = clampFront(i, state.plates.plates.length);
  if (front !== state.plates.front) set({ plates: { ...state.plates, front } });
}
export function clearPlate() {
  const { plates, front } = state.plates;
  if (!plates[front]) return;
  const rest = plates.filter((_, i) => i !== front);
  set({ plates: { ...state.plates, plates: rest, front: clampFront(front, rest.length) } });
}
/** M2 `logPlate`: the front plate leaves the plate and becomes a meal in the log, logged at `hall` (a plate several halls serve takes the first). */
export function log(hall?: PlaceKey) {
  const { plates, front, nextId } = state.plates;
  const plate = plates[front];
  if (!plate) return;
  const at = hall ?? plateHalls(plate)?.[0] ?? null;
  const entry: LogEntry = {
    id: state.log.reduce((m, e) => Math.max(m, e.id), 0) + 1, meal: plate.meal, place: at,
    items: plate.items.map((it) => { const m = macroOf(it, at ?? undefined); return { name: it.name, qty: it.qty, cal: m.cal, p: m.p, c: m.c, f: m.f }; }),
  };
  const rest = plates.filter((_, i) => i !== front);
  set({ plates: { plates: rest, front: clampFront(front, rest.length), nextId }, log: [...state.log, entry], last: { entry, plate, idx: front } }, true);
}
/** M2 `undoLog`: the meal leaves the log and its plate goes back to the index it had. */
export function undo() {
  const l = state.last;
  if (!l) return;
  const plates = [...state.plates.plates];
  plates.splice(Math.min(l.idx, plates.length), 0, l.plate);
  set({ plates: { ...state.plates, plates, front: Math.min(l.idx, plates.length - 1) }, log: state.log.filter((e) => e.id !== l.entry.id), last: null }, true);
}
export const dropReceipt = () => { if (state.last) set({ last: null }); };
export const setPrefs = (patch: Partial<Prefs>) => set({ prefs: { ...state.prefs, ...patch } }, true);
export const setShow = (patch: Partial<Toggles>) => set({ show: { ...state.show, ...patch } }, true);
const NEWTON_AREA = 4;
const inNewton = (p: Plate) => !!plateHalls(p)?.some((k) => loadFixture().places.find((x) => x.key === k)?.area === NEWTON_AREA);
/** The Charles River toggle. Off sets that campus's plates aside, on brings them back as they were (M2 `setNewton`). Nothing is deleted. */
export function setNewton(on: boolean) {
  if (on === state.newton) return;
  const { plates, front, nextId } = state.plates;
  if (on) set({ newton: true, off: [], plates: { plates: [...plates, ...state.off], front, nextId } }, true);
  else {
    const rest = plates.filter((p) => !inNewton(p));
    set({ newton: false, off: [...state.off, ...plates.filter(inNewton)], plates: { plates: rest, front: clampFront(front, rest.length), nextId } }, true);
  }
}
export function resetStore() { state = INITIAL; listeners.forEach((l) => l()); }

/** The number the bar, the You screen and the receipt print: calories logged today (the clock is fixed on one day). */
export const loggedCal = (entries: LogEntry[]) => entries.reduce((a, e) => a + e.items.reduce((b, i) => b + i.cal * i.qty, 0), 0);

// ---- dev only: seed the store from a route's query for screenshots
/**
 * `bakeoff?reset=1&diet=veg,halal&avoid=Milk,Soy&scores=health,carbon&newton=1&plate=W:lunch:beef brisket noodle bowl,golden bbq chicken thigh*2;F:lunch:...&logged=1`
 * A plate is `place:meal:key[*qty]` (`*h` is half); plates are separated by `;`; `logged=N` logs the first N plates and drops the receipt unless `receipt=1`.
 * `reset=1` clears what the device kept first (seeded state persists only like any other: with the next setting change). Does nothing outside __DEV__.
 */
export async function applyDevParams(q: Record<string, string | string[] | undefined>) {
  if (!__DEV__) return;
  await hydrate();   // what the device kept lands first, so a seed is never overwritten by it
  const str = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const list = (k: string) => (str(k) ? str(k).split(",") : []);
  if (str("reset")) { try { await AsyncStorage.removeItem(KEY); } catch { /* nothing kept */ } resetStore(); }
  const patch: Partial<State> = {};
  if ("diet" in q || "avoid" in q) { const d = list("diet"); patch.prefs = { veg: d.includes("veg"), plant: d.includes("plant"), halal: d.includes("halal"), avoid: list("avoid") }; }
  if ("scores" in q) { const s = list("scores"); patch.show = { health: s.includes("health"), carbon: s.includes("carbon") }; }
  if ("newton" in q) patch.newton = str("newton") === "1";
  if (str("plate")) {
    const fx = loadFixture();
    let plates = emptyPlates;
    for (const spec of str("plate").split(";")) {
      const [place, meal, items] = spec.split(":");
      for (const it of items.split(",")) {
        const [key, qty] = it.split("*");
        const d = servingOn(fx, "2026-10-08", place as PlaceKey, meal as MealKey, dishKey(key));
        if (!d) continue;
        plates = addDish(plates, meal as MealKey, d.name, { [place]: d });
        const id = plates.plates[plates.front].id;
        if (qty === "h") plates = stepItem(plates, id, d.key, -1);
        else for (let n = 1; n < (+qty || 1); n++) plates = addDish(plates, meal as MealKey, d.name, { [place]: d });
      }
    }
    patch.plates = plates;
  }
  state = { ...state, ...patch };
  for (let n = +str("logged") || 0; n > 0; n--) { setFront(0); log(); }
  set({ last: "receipt" in q ? state.last : null });
}
