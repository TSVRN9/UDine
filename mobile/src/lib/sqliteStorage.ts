import { DEFAULT_ROLLOVER_HOUR, effectiveDayOf, type LogEntry, type LogStorage } from "@udine/shared";
import { getDb } from "./db";

interface Row {
  id: string;
  logged_at: string;
  source_json: string;
  servings: number;
  nutrition_json: string;
}

function rowToEntry(row: Row): LogEntry {
  return {
    id: row.id,
    loggedAt: row.logged_at,
    source: JSON.parse(row.source_json),
    servings: row.servings,
    nutrition: JSON.parse(row.nutrition_json),
  };
}

/** SQLite-backed LogStorage — device-only, see CLAUDE.md data residency table. */
export class SqliteLogStorage implements LogStorage {
  async addEntry(entry: LogEntry): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO log_entries (id, logged_at, source_json, servings, nutrition_json) VALUES (?, ?, ?, ?, ?)",
      entry.id,
      entry.loggedAt,
      JSON.stringify(entry.source),
      entry.servings,
      JSON.stringify(entry.nutrition),
    );
  }

  async removeEntry(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync("DELETE FROM log_entries WHERE id = ?", id);
  }

  // A raw `logged_at LIKE '<isoDate>%'` SQL match compares the entry's RAW calendar-day prefix
  // against `isoDate` -- but `isoDate` is normally an *effective* day (todayIso()/effectiveTodayIso
  // output), and a snack logged at 12:30 AM is stamped with the new raw calendar day while its
  // effective day is still the one that's ending (see effectiveDayOf's doc comment, shared/src/
  // date.ts). Filtering in JS via effectiveDayOf fixes that -- ponytail: this re-fetches every
  // entry and filters in memory rather than pushing the rollover math into SQL; fine for a
  // personal log's row count, revisit with a computed-column/date-range WHERE if this table ever
  // gets large enough for that to matter.
  async getEntriesForDate(isoDate: string): Promise<LogEntry[]> {
    const all = await this.getAllEntries();
    return all.filter((e) => effectiveDayOf(e.loggedAt, DEFAULT_ROLLOVER_HOUR) === isoDate);
  }

  async getAllEntries(): Promise<LogEntry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>("SELECT * FROM log_entries ORDER BY logged_at");
    return rows.map(rowToEntry);
  }
}
