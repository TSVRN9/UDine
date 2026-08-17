import type { LogEntry, LogStorage } from "@udine/shared";
import * as SQLite from "expo-sqlite";

const DB_NAME = "udine.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS log_entries (
           id TEXT PRIMARY KEY NOT NULL,
           logged_at TEXT NOT NULL,
           source_json TEXT NOT NULL,
           servings REAL NOT NULL,
           nutrition_json TEXT NOT NULL
         );`,
      );
      return db;
    });
  }
  return dbPromise;
}

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

  async getEntriesForDate(isoDate: string): Promise<LogEntry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>("SELECT * FROM log_entries WHERE logged_at LIKE ? ORDER BY logged_at", `${isoDate}%`);
    return rows.map(rowToEntry);
  }

  async getAllEntries(): Promise<LogEntry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>("SELECT * FROM log_entries ORDER BY logged_at");
    return rows.map(rowToEntry);
  }
}
