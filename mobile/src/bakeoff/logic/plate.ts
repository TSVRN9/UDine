import { MEAL_LABEL, dishKey, isCafe, placeName, placeOrder } from "./fixture";
import type { Dish, MealKey, PlaceKey } from "./types";

export interface PlateItem { key: string; name: string; qty: number; refs: Partial<Record<PlaceKey, Dish>>; custom?: Pick<Dish, "cal" | "p" | "c" | "f"> }
export interface Plate { id: number; meal: MealKey; items: PlateItem[] }
export interface PlateState { plates: Plate[]; front: number; nextId: number }
export const emptyPlates: PlateState = { plates: [], front: 0, nextId: 1 };

/** The places that serve everything on the plate (custom items serve anywhere), halls first; null for an all-custom plate. */
export function plateHalls(p: Plate): PlaceKey[] | null {
  let s: PlaceKey[] | null = null;
  for (const it of p.items) {
    if (it.custom) continue;
    const h = Object.keys(it.refs) as PlaceKey[];
    s = s ? s.filter((x) => h.includes(x)) : [...h].sort((a, b) => placeOrder(a) - placeOrder(b));
  }
  return s;
}
const canJoin = (p: Plate, meal: MealKey, hs: PlaceKey[] | null) => {
  if (p.meal !== meal) return false;
  const ph = plateHalls(p);
  return !ph || !hs || ph.some((h) => hs.includes(h));
};

export function addDish(s: PlateState, meal: MealKey, name: string, refs: Partial<Record<PlaceKey, Dish>>, custom?: PlateItem["custom"]): PlateState {
  const key = custom ? "custom:" + dishKey(name) : dishKey(name);
  const hs = custom ? null : (Object.keys(refs) as PlaceKey[]);
  const front = s.plates[s.front];
  let plates = s.plates, nextId = s.nextId, idx = front && canJoin(front, meal, hs) ? s.front : plates.findIndex((p) => canJoin(p, meal, hs));
  if (idx < 0) { plates = [...plates, { id: nextId++, meal, items: [] }]; idx = plates.length - 1; }
  const pl = plates[idx], at = pl.items.findIndex((x) => x.key === key);
  const items = at < 0 ? [...pl.items, { key, name, qty: 1, refs: { ...refs }, custom }]
    : pl.items.map((it, i) => i !== at ? it : { ...it, qty: it.qty === 0.5 ? 1 : it.qty + 1,
        refs: custom ? it.refs : Object.fromEntries(Object.entries(it.refs).filter(([h]) => h in refs)) });
  return { plates: plates.map((p, i) => (i === idx ? { ...p, items } : p)), front: idx, nextId };
}

/** +1: 1/2 -> 1, n -> n+1. -1: n -> n-1 down to 1, 1 -> 1/2, 1/2 -> removed; an emptied plate goes with it. */
export function stepItem(s: PlateState, plateId: number, key: string, dir: 1 | -1): PlateState {
  const pi = s.plates.findIndex((p) => p.id === plateId);
  const pl = s.plates[pi], it = pl?.items.find((x) => x.key === key);
  if (!it) return s;
  const qty = dir > 0 ? (it.qty === 0.5 ? 1 : it.qty + 1) : it.qty > 1 ? it.qty - 1 : it.qty === 1 ? 0.5 : 0;
  const items = qty ? pl.items.map((x) => (x === it ? { ...x, qty } : x)) : pl.items.filter((x) => x !== it);
  if (items.length) return { ...s, plates: s.plates.map((p, i) => (i === pi ? { ...p, items } : p)) };
  const plates = s.plates.filter((_, i) => i !== pi);
  return { ...s, plates, front: Math.max(0, Math.min(s.front, plates.length - 1)) };
}

const macroOf = (it: PlateItem, hall?: PlaceKey) => it.custom ?? (hall && it.refs[hall]) ?? Object.values(it.refs)[0]!;
export function totals(p: Plate, hall?: PlaceKey) {
  hall ??= plateHalls(p)?.[0];
  const t = { cal: 0, p: 0, c: 0, f: 0, n: 0 };
  for (const it of p.items) { const m = macroOf(it, hall); t.cal += m.cal * it.qty; t.p += m.p * it.qty; t.c += m.c * it.qty; t.f += m.f * it.qty; t.n += it.qty; }
  return t;
}

function hallLabel(hs: PlaceKey[] | null): string {
  if (!hs) return "";
  const n = hs.map(placeName);
  return n.length === 1 ? n[0] : n.length === 4 && !hs.some(isCafe) ? "Any hall" : n.slice(0, -1).join(", ") + " or " + n[n.length - 1];
}
export function plateLabel(p: Plate): string {
  const hs = plateHalls(p);
  return hs ? `${hallLabel(hs)} ${MEAL_LABEL[p.meal].toLowerCase()}` : MEAL_LABEL[p.meal];
}
