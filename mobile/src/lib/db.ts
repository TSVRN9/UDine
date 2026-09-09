import * as SQLite from "expo-sqlite";

const DB_NAME = "udine.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Shared SQLite connection — all local tables live in one file, opened once. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS log_entries (
           id TEXT PRIMARY KEY NOT NULL,
           logged_at TEXT NOT NULL,
           source_json TEXT NOT NULL,
           servings REAL NOT NULL,
           nutrition_json TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS favorites (
           key TEXT PRIMARY KEY NOT NULL,
           favorite_json TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS preferences_kv (
           key TEXT PRIMARY KEY NOT NULL,
           value_json TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS custom_foods (
           id TEXT PRIMARY KEY NOT NULL,
           food_json TEXT NOT NULL
         );`,
      );
      return db;
    });
    // A rejected open must not poison every future getDb() call for the rest of the process --
    // reset so the next call retries. The `.then` above still rejects for the original caller.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}
