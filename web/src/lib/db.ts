export const DB_NAME = "udine";
export const VERSION = 4;

export const STORES = { logEntries: "logEntries", favorites: "favorites", rankedDishes: "rankedDishes", rankedFoods: "rankedFoods" } as const;

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
			if (!req.result.objectStoreNames.contains(STORES.rankedFoods)) {
				req.result.createObjectStore(STORES.rankedFoods, { keyPath: "dishName" });
			}
		};
		req.onsuccess = () => {
			const db = req.result;
			// Release the connection on a future upgrade instead of blocking it (issue #193) --
			// without this, a stale tab left open across a deploy blocks every new-version open
			// forever, since nothing else ever tells this connection to close.
			db.onversionchange = () => db.close();
			resolve(db);
		};
		req.onblocked = () => {
			reject(new Error("Couldn't open the database -- close other UDine tabs and try again."));
		};
		req.onerror = () => reject(req.error);
	});
}
