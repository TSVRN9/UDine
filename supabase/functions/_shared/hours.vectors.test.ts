// Runs shared/vectors/hours.json against the Deno hours copy. Covers kinds map_info_v2 (halls only;
// retail, address and mapAddress are not mapped here) and status (only the open/closed + closing time:
// Deno has no effective-window synthesis, no opensAt, no mealPeriod). street_address
// and map_address are not covered: hours.ts has no address handling.
//
// Run (repo root): deno test --node-modules-dir=none --allow-env --allow-read=shared/vectors supabase/functions/_shared/hours.vectors.test.ts
import { currentlyOpenUntil, mapHallHours, type HallHours } from "./hours.ts";
import { defineVectorTests, same } from "./testing/vectors.ts";

const KNOWN_DIVERGENT: Record<string, string> = {};

function withFixedNow<T>(iso: string, fn: () => T): T {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor() {
      super(iso);
    }
    static override now() {
      return new RealDate(iso).getTime();
    }
  }
  // deno-lint-ignore no-explicit-any
  globalThis.Date = FixedDate as any;
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

const eastern = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
/** UTC instant -> "H:MM AM/PM" Eastern, the label form currentlyOpenUntil returns. */
const label = (utc: string) => eastern.format(new Date(utc)).replace(/ /g, " ");

const pick = (h: HallHours) => ({ hallTid: h.hallTid, breakfast: h.breakfast, lunch: h.lunch, dinner: h.dinner, general: h.general });

defineVectorTests("hours.ts", "hours.json", ["map_info_v2", "status"], (c) => {
  if (c.kind === "map_info_v2") {
    const want = new Map<number, ReturnType<typeof pick>>();
    for (const h of c.expected.halls) want.set(h.hallTid, pick(h));
    const got = mapHallHours(c.input);
    const sorted = (m: Map<number, unknown>) => [...m.entries()].sort((a, b) => a[0] - b[0]);
    return same(sorted(got), sorted(want)) ? null : `expected ${JSON.stringify(sorted(want))}, got ${JSON.stringify(sorted(got))}`;
  }
  const { hours, now } = c.input;
  const open = c.expected.openStatus;
  const want = open.open ? label(open.closesAt) : null;
  const got = withFixedNow(now, () => currentlyOpenUntil(hours));
  return got === want ? null : `expected ${want}, got ${got}`;
}, KNOWN_DIVERGENT);
