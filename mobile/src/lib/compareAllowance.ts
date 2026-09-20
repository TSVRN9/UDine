import { DAILY_ALLOWANCE } from "./compare";
import { getDb } from "./db";

const KEY = "compare_daily_allowance";

/** One small JSON string. Injectable so tests need no SQLite. */
export interface AllowanceStore {
  read(): Promise<string | null>;
  write(json: string): Promise<void>;
}

/**
 * Device-only, always (CLAUDE.md residency table): one `{date, count}` record in preferences_kv, next to
 * `ranked_dishes`. Throttle state, not user data: deliberately not exported, never synced.
 */
export const sqliteAllowanceStore: AllowanceStore = {
  async read() {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
    return row?.value_json ?? null;
  },
  async write(json) {
    const db = await getDb();
    await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", KEY, json);
  },
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date, "YYYY-MM-DD" (not toISOString: that is UTC). */
function localDate(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Picks recorded on `now`'s local date. A missing/corrupt record, or one from any other date, is zero. */
export async function picksToday(store: AllowanceStore, now: Date): Promise<number> {
  try {
    const raw = await store.read();
    const rec = raw ? JSON.parse(raw) : null;
    if (rec?.date !== localDate(now) || !Number.isInteger(rec.count) || rec.count < 0) return 0;
    return Math.min(rec.count, DAILY_ALLOWANCE);
  } catch {
    return 0;
  }
}

export async function remainingToday(store: AllowanceStore, now: Date): Promise<number> {
  return DAILY_ALLOWANCE - (await picksToday(store, now));
}

/** Dev-only `--stress compare-seed*` fixtures: an in-memory store already holding `count` picks for `now`'s date, so nothing on the device is read or written. */
export function memoryAllowanceStore(count = 0, now = new Date()): AllowanceStore {
  let json: string | null = count > 0 ? JSON.stringify({ date: localDate(now), count }) : null;
  return {
    read: async () => json,
    write: async (next) => {
      json = next;
    },
  };
}

// Every call chains on the last: read-modify-write is not atomic, so overlapping picks would lose an increment.
// A rejected call is swallowed on the queue only (its caller still sees it), so it never wedges later calls.
let queue: Promise<unknown> = Promise.resolve();

/** Records one You-pane pick and returns today's count. At the cap it writes nothing and returns the cap. A failed write rejects. */
export function recordDailyPick(store: AllowanceStore, now: Date): Promise<number> {
  const run = queue.then(async () => {
    const count = await picksToday(store, now);
    if (count >= DAILY_ALLOWANCE) return count;
    await store.write(JSON.stringify({ date: localDate(now), count: count + 1 }));
    return count + 1;
  });
  queue = run.catch(() => {});
  return run;
}
