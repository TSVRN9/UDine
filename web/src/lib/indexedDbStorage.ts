import type { LogEntry, LogStorage } from "@udine/shared";

const DB_NAME = "udine";
const STORE = "logEntries";

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			req.result.createObjectStore(STORE, { keyPath: "id" });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/** IndexedDB implementation of LogStorage — see @udine/shared's LogStorage contract. Browser-only. */
export class IndexedDbLogStorage implements LogStorage {
	async addEntry(entry: LogEntry): Promise<void> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			tx.objectStore(STORE).put(entry);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async removeEntry(id: string): Promise<void> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			tx.objectStore(STORE).delete(id);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async getAllEntries(): Promise<LogEntry[]> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readonly");
			const req = tx.objectStore(STORE).getAll();
			req.onsuccess = () => resolve(req.result as LogEntry[]);
			req.onerror = () => reject(req.error);
		});
	}

	async getEntriesForDate(isoDate: string): Promise<LogEntry[]> {
		const all = await this.getAllEntries();
		return all.filter((e) => e.loggedAt.startsWith(isoDate));
	}
}
