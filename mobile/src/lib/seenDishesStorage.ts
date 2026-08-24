import type { SeenDishesStorage } from "@udine/shared";
import { getDb } from "./db";

const KEY = "seen_dishes";

// #149: recordSeen is read-modify-write against one shared row. Two overlapping calls (different
// SqliteSeenDishesStorage instances included — menuFetchWithSeenTracking.ts and YouPane.tsx each
// hold their own) can read the same snapshot and the later write clobbers the earlier one, for
// both a different-hall race and a same-hall race. Serialized with a module-level promise chain
// (not an instance field) so it holds across every instance, since they all touch the same row.
// ponytail: one global chain for this one row — fine at this write volume; per-hall chains only
// worth it if writes ever contend enough to matter.
let writeQueue: Promise<void> = Promise.resolve();

async function writeSeen(hallTid: number, dishNames: string[]): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
  const byHall: Record<string, string[]> = row ? JSON.parse(row.value_json) : {};
  const existing = new Set(byHall[hallTid] ?? []);
  for (const name of dishNames) existing.add(name);
  byHall[hallTid] = [...existing];
  await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", KEY, JSON.stringify(byHall));
}

/**
 * SQLite-backed SeenDishesStorage (#89/#92) — device-only, always, see CLAUDE.md data residency
 * table. Reuses the existing preferences_kv table (small JSON blobs), same pattern as
 * SqliteRankingStorage: one row, keyed by hallTid (stringified — JSON object keys are always
 * strings) to a distinct dish-name array. recordSeen is read-modify-write with set-union semantics
 * per hall, matching InMemorySeenDishesStorage's contract (shared/src/completion.ts) exactly.
 */
export class SqliteSeenDishesStorage implements SeenDishesStorage {
  recordSeen(hallTid: number, dishNames: string[]): Promise<void> {
    const run = () => writeSeen(hallTid, dishNames);
    // Chain onto the previous write whether it succeeded or failed, so one rejected write can't
    // wedge every write after it; the caller still sees their own call's real outcome via `result`.
    const result = writeQueue.then(run, run);
    writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async getAllSeenDishNames(): Promise<Map<number, string[]>> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
    const byHall: Record<string, string[]> = row ? JSON.parse(row.value_json) : {};
    return new Map(Object.entries(byHall).map(([hallTid, names]) => [Number(hallTid), names]));
  }
}
