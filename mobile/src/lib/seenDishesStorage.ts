import type { SeenDishesStorage } from "@udine/shared";
import { getDb } from "./db";

const KEY = "seen_dishes";

/**
 * SQLite-backed SeenDishesStorage (#89/#92) — device-only, always, see CLAUDE.md data residency
 * table. Reuses the existing preferences_kv table (small JSON blobs), same pattern as
 * SqliteRankingStorage: one row, keyed by hallTid (stringified — JSON object keys are always
 * strings) to a distinct dish-name array. recordSeen is read-modify-write with set-union semantics
 * per hall, matching InMemorySeenDishesStorage's contract (shared/src/completion.ts) exactly.
 */
export class SqliteSeenDishesStorage implements SeenDishesStorage {
  async recordSeen(hallTid: number, dishNames: string[]): Promise<void> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
    const byHall: Record<string, string[]> = row ? JSON.parse(row.value_json) : {};
    const existing = new Set(byHall[hallTid] ?? []);
    for (const name of dishNames) existing.add(name);
    byHall[hallTid] = [...existing];
    await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", KEY, JSON.stringify(byHall));
  }

  async getAllSeenDishNames(): Promise<Map<number, string[]>> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
    const byHall: Record<string, string[]> = row ? JSON.parse(row.value_json) : {};
    return new Map(Object.entries(byHall).map(([hallTid, names]) => [Number(hallTid), names]));
  }
}
