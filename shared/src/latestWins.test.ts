import { test } from "node:test";
import assert from "node:assert/strict";
import { createLatestWins } from "./latestWins.ts";

// Simulates #192 exactly: two search-as-you-type requests fire in order ("za" then "zac"), but
// the earlier one is slower and resolves LAST. `apply` mimics setSearchResults/searchResults=...
async function runSearch(term: string, delayMs: number, apply: (results: string[]) => void, guard?: ReturnType<typeof createLatestWins>) {
  const token = guard?.start();
  await new Promise((r) => setTimeout(r, delayMs));
  if (guard && !guard.isLatest(token!)) return; // stale -- drop it
  apply([`${term}-result`]);
}

test("#192 bug reproduced: with no guard, the stale slower response clobbers the newer faster one", async () => {
  let applied: string[] = [];
  const first = runSearch("za", 20, (r) => (applied = r)); // fired first, slow
  const second = runSearch("zac", 0, (r) => (applied = r)); // fired second, fast, resolves first
  await Promise.all([first, second]);
  assert.deepEqual(applied, ["za-result"]); // wrong: "za"'s stale results win
});

test("#192 fix: createLatestWins makes the later query's results win regardless of resolve order", async () => {
  const guard = createLatestWins();
  let applied: string[] = [];
  const first = runSearch("za", 20, (r) => (applied = r), guard);
  const second = runSearch("zac", 0, (r) => (applied = r), guard);
  await Promise.all([first, second]);
  assert.deepEqual(applied, ["zac-result"]); // correct: "zac"'s results win
});

test("createLatestWins: a single in-flight request is latest", () => {
  const guard = createLatestWins();
  const token = guard.start();
  assert.equal(guard.isLatest(token), true);
});
