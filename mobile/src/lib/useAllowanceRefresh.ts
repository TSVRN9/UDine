import { useEffect } from "react";
import { AppState } from "react-native";
import { picksToday, type AllowanceStore } from "./compareAllowance";

// Fires just after the local date has turned, so a timer that runs a hair early still lands on the new day.
const MIDNIGHT_MARGIN_MS = 1000;

/** Milliseconds from `now` to the next LOCAL midnight (a 23h or 25h DST day included: the date is rebuilt, not 24h added). */
export function msUntilNextMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
}

const systemNow = () => new Date();

/**
 * Keeps the You pane's "picks today" current without reading on every render: once on mount, whenever the app returns to the
 * foreground, and at each local midnight (one re-armed timeout). After a pick the pane sets the count itself.
 */
export function useAllowanceRefresh(store: AllowanceStore, onPicks: (n: number) => void, now: () => Date = systemNow): void {
  useEffect(() => {
    let live = true;
    const read = () => {
      picksToday(store, now()).then((n) => live && onPicks(n));
    };
    read();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        read();
        arm();
      }, msUntilNextMidnight(now()) + MIDNIGHT_MARGIN_MS);
    };
    arm();
    return () => {
      live = false;
      clearTimeout(timer);
      sub.remove();
    };
  }, [store, onPicks, now]);
}
