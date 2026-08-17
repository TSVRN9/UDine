const DB_NAME = "udine";
const VERSION = 3;

export const STORES = { logEntries: "logEntries", favorites: "favorites", rankedDishes: "rankedDishes" } as const;

/** Single shared IndexedDB connection/upgrade path — every store lives in one DB, one version. */
export function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, VERSION);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORES.logEntries)) {
				req.result.createObjectStore(STORES.logEntries, { keyPath: "id" });
			}
			if (!req.result.objectStoreNames.contains(STORES.favorites)) {
				req.result.createObjectStore(STORES.favorites, { keyPath: "key" });
			}
			if (!req.result.objectStoreNames.contains(STORES.rankedDishes)) {
				req.result.createObjectStore(STORES.rankedDishes, { keyPath: "key" });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
