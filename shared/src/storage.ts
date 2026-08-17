import type { LogEntry } from "./types.ts";

/**
 * Device-local persistence for health data. Implemented per-platform
 * (IndexedDB on web, SQLite on mobile) — this file only defines the contract
 * plus an in-memory implementation for tests. Nothing implementing this
 * interface may call a network API; that's the whole point (see CLAUDE.md
 * data residency table).
 */
export interface LogStorage {
  addEntry(entry: LogEntry): Promise<void>;
  removeEntry(id: string): Promise<void>;
  getEntriesForDate(isoDate: string): Promise<LogEntry[]>;
  getAllEntries(): Promise<LogEntry[]>;
}

export class InMemoryLogStorage implements LogStorage {
  private entries = new Map<string, LogEntry>();

  async addEntry(entry: LogEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async removeEntry(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async getEntriesForDate(isoDate: string): Promise<LogEntry[]> {
    return [...this.entries.values()].filter((e) => e.loggedAt.startsWith(isoDate));
  }

  async getAllEntries(): Promise<LogEntry[]> {
    return [...this.entries.values()];
  }
}

/** JSON export of every local log entry — the "data never leaves the device unless exported" release valve. */
export function exportEntriesAsJson(entries: LogEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

const CSV_COLUMNS = ["id", "loggedAt", "dishName", "servings", "calories", "proteinG", "totalCarbG", "totalFatG"] as const;

export function exportEntriesAsCsv(entries: LogEntry[]): string {
  const rows = entries.map((e) => {
    const dishName = e.source.type === "umass-menu" ? e.source.dishName : e.source.productName;
    return [e.id, e.loggedAt, dishName, e.servings, e.nutrition.calories, e.nutrition.proteinG, e.nutrition.totalCarbG, e.nutrition.totalFatG]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}
