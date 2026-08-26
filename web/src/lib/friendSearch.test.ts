import { test } from "node:test";
import assert from "node:assert/strict";
import { createLatestWins } from "@udine/shared";
import { runFriendSearch, type Profile } from "./friendSearch.ts";

// #192: "za" is searched first but resolves slower; "zac" is searched right after and resolves
// first. The later query's results must win, regardless of resolve order.
test("runFriendSearch: a later search's results win over an earlier search that resolves after it", async () => {
  const guard = createLatestWins();
  let applied: Profile[] | null = null;

  let resolveZa!: (v: { data: { user_id: string; display_name: string }[] }) => void;
  const zaPromise = new Promise<{ data: { user_id: string; display_name: string }[] }>((resolve) => (resolveZa = resolve));
  const zaCall = runFriendSearch(guard, () => zaPromise).then((r) => {
    if (r !== null) applied = r;
  });

  let resolveZac!: (v: { data: { user_id: string; display_name: string }[] }) => void;
  const zacPromise = new Promise<{ data: { user_id: string; display_name: string }[] }>((resolve) => (resolveZac = resolve));
  const zacCall = runFriendSearch(guard, () => zacPromise).then((r) => {
    if (r !== null) applied = r;
  });

  // faster, later-fired search resolves first
  resolveZac({ data: [{ user_id: "zac-1", display_name: "Zac Jones" }] });
  await zacCall;
  // slower, earlier-fired search resolves after -- must be dropped as stale
  resolveZa({ data: [{ user_id: "za-1", display_name: "Za Smith" }] });
  await zaCall;

  assert.deepEqual(applied, [{ user_id: "zac-1", display_name: "Zac Jones" }]);
});

test("runFriendSearch: a single in-flight search applies its results", async () => {
  const guard = createLatestWins();
  const result = await runFriendSearch(guard, () => Promise.resolve({ data: [{ user_id: "a", display_name: "A" }] }));
  assert.deepEqual(result, [{ user_id: "a", display_name: "A" }]);
});
