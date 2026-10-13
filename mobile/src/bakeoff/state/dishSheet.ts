import { useEffect, useSyncExternalStore } from "react";
import type { DishCtx } from "../logic/dishSheet";
import type { Dish } from "../logic/types";

export interface OpenDish { dish: Dish; ctx: DishCtx; seq: number }

// One dish sheet at a time, shown by `DishSheetHost`. A module store like prefs.ts: the rows that open it (a hall's, later the plate's) need no
// provider, and the host is mounted once, above them.
let open: OpenDish | null = null, seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Open the dish sheet. Refused (false) while one is on screen or still leaving: a second tap never stacks or restarts a sheet. */
export function openDish(dish: Dish, ctx: DishCtx): boolean {
  if (open) return false;
  open = { dish, ctx, seq: ++seq };
  emit();
  return true;
}
/** The host calls this once the sheet has left. */
export function closeDish() {
  if (!open) return;
  open = null;
  emit();
}
export const getOpenDish = () => open;
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useOpenDish = () => useSyncExternalStore(subscribe, getOpenDish, getOpenDish);
/**
 * The host calls this once. `open` clears only when the sheet finishes leaving, so a host that unmounts while a dish is open (a screen
 * torn down under it) would leave every later `openDish` refused; its unmount clears the flag.
 */
export function useClearOnUnmount() {
  useEffect(() => closeDish, []);
}
