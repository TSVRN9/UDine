import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { openDb, DB_NAME, VERSION, STORES } from "./db.ts";

// Issue #193: a stale pre-deploy tab holding an older-version connection blocks a newer version's
// open. Without onblocked/onversionchange handling, that blocked request never settles -- openDb()
// hangs forever instead of erroring, and the old tab never releases the connection to unblock it.

beforeEach(() => {
	// Fresh, empty database for every test -- avoids cross-test leakage of open connections/versions.
	globalThis.indexedDB = new IDBFactory();
});

test("openDb rejects instead of hanging forever when an older-version connection blocks the upgrade", async () => {
	// Simulate a stale tab: an old connection at a lower version that never closes itself.
	const staleConn = await new Promise<IDBDatabase>((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, VERSION - 1);
		req.onupgradeneeded = () => {};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});

	const HANG = Symbol("hang");
	const outcome = await Promise.race([
		openDb().then(
			() => "resolved" as const,
			() => "rejected" as const,
		),
		new Promise((resolve) => setTimeout(() => resolve(HANG), 300)),
	]);

	staleConn.close();

	assert.notStrictEqual(outcome, HANG, "openDb() never settled -- a blocked open hangs forever instead of rejecting");
	assert.strictEqual(outcome, "rejected", "openDb() should reject when another connection blocks the version upgrade");
});

test("openDb closes its connection on versionchange, so it doesn't block a later upgrade", async () => {
	const dbA = await openDb();
	try {
		// A later open elsewhere (e.g. after a deploy) bumps the version -- dbA should release itself
		// via onversionchange instead of blocking this new request.
		await new Promise<void>((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, VERSION + 1);
			req.onupgradeneeded = () => {};
			req.onblocked = () => reject(new Error("second open was blocked -- the first connection's onversionchange did not close it"));
			req.onsuccess = () => {
				req.result.close();
				resolve();
			};
			req.onerror = () => reject(req.error);
		});

		assert.throws(
			() => dbA.transaction(STORES.favorites, "readonly"),
			"dbA should already be closed by its own onversionchange handler",
		);
	} finally {
		// Don't leave a permanently-open connection behind on failure -- fake-indexeddb polls
		// forever waiting for it to close, which hangs the whole test process.
		dbA.close();
	}
});
