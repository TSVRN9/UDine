// Repro for #244 item 2: db.ts cached a rejected openDatabaseAsync forever. openDatabaseAsync is
// mocked at the expo-sqlite boundary (same technique as menuHoursCache.test.ts) so getDb()'s own
// singleton/table-creation code stays in play.
const mockOpen = jest.fn();

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: (...args: unknown[]) => mockOpen(...args),
}));

import { getDb } from "./db";

beforeEach(() => {
  mockOpen.mockReset();
});

it("retries on the next getDb() call after a rejected open, instead of caching the rejection forever", async () => {
  const firstError = new Error("disk hiccup");
  mockOpen.mockRejectedValueOnce(firstError);
  mockOpen.mockResolvedValueOnce({ execAsync: async () => {} });

  await expect(getDb()).rejects.toBe(firstError);

  await expect(getDb()).resolves.toBeDefined();
});
