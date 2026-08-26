import { deleteServerData } from "./deleteServerData";

// STEP names (what shows up in failedSteps/undeletableSteps) vs. the real table each step's
// `.from(...)` call targets -- these diverge for exactly one step: "notifications" is a
// `profiles.update(...)`, not a delete, so it shares the "profiles" table with the pre-existing
// undeletable `profiles.delete(...)` step. `client()` below distinguishes the two by operation
// (`.update()` vs `.delete()`/`.or()`), not by step name, so each can be failed independently.
const RETRYABLE_STEPS = ["friendships", "favorited_foods", "shared_stats", "favorite_dining_halls", "notifications", "push_tokens", "pings"] as const;
const UNDELETABLE_STEPS = ["profiles", "food_sightings", "qr_tokens"] as const;
const ALL_STEPS = [...RETRYABLE_STEPS, ...UNDELETABLE_STEPS] as const;
// The actual `.from(table)` calls in step order -- "profiles" appears twice (the "notifications"
// update step, then the pre-existing "profiles" delete step).
const CALL_TABLES = ["friendships", "favorited_foods", "shared_stats", "favorite_dining_halls", "profiles", "push_tokens", "pings", "profiles", "food_sightings", "qr_tokens"] as const;

/** Maps a STEP name to the key `errors`/`_updates` below is keyed by. Every step but
 * "notifications" targets a table 1:1 with its own name; "notifications" is an `.update()` against
 * "profiles", tracked under "profiles:update" so it doesn't collide with the "profiles" step's own
 * `.delete()`. */
function errorKeyFor(step: string): string {
  return step === "notifications" ? "profiles:update" : step;
}

function client(errors: Partial<Record<string, unknown>>) {
  const calls: string[] = [];
  const updates: Record<string, unknown> = {};
  return {
    from(table: string) {
      calls.push(table);
      const builder: Record<string, unknown> = {};
      let errorKey = table;
      builder.delete = () => {
        errorKey = table;
        return builder;
      };
      builder.update = (patch: unknown) => {
        errorKey = `${table}:update`;
        updates[table] = patch;
        return builder;
      };
      builder.eq = () => Promise.resolve({ error: errors[errorKey] ?? null });
      builder.or = () => Promise.resolve({ error: errors[errorKey] ?? null });
      return builder;
    },
    _calls: calls,
    _updates: updates,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("deleteServerData", () => {
  it("attempts all ten steps, in order, when nothing errors", async () => {
    const c = client({});
    const result = await deleteServerData(c, "me");
    expect(result).toEqual({ ok: true, failedSteps: [], undeletableSteps: [] });
    expect(c._calls).toEqual([...CALL_TABLES]);
  });

  // The #237 bug, red-first: profiles has no owner DELETE grant/policy (see deleteServerData.ts's
  // own doc comment) and is denied on EVERY invocation. Before this fix, that denial landed in the
  // same `failedSteps` bucket as a real transient failure, so `ok` was false on every single run --
  // there was no reachable success path, ever, even though the other three steps that existed back
  // then genuinely succeeded. Reverting the `retryable ? failedSteps : undeletableSteps` split back
  // to "always push to failedSteps" turns this red again.
  it("profiles-only denial does not fail the overall result -- it's a known, permanent limitation, not a retryable error", async () => {
    const c = client({ profiles: { message: "permission denied" } });
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(true);
    expect(result.failedSteps).toEqual([]);
    expect(result.undeletableSteps).toEqual(["profiles"]);
    // Still attempted, not silently skipped, and every other step still ran. The "notifications"
    // step's own profiles.update() is unaffected -- it's keyed separately (see errorKeyFor).
    expect(c._calls).toEqual([...CALL_TABLES]);
  });

  it("food_sightings-only denial is also undeletable, not a retryable failure", async () => {
    const c = client({ food_sightings: { message: "permission denied" } });
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(true);
    expect(result.failedSteps).toEqual([]);
    expect(result.undeletableSteps).toEqual(["food_sightings"]);
  });

  // Finding 1 from the #246 review: qr_tokens (20260824150000_add_friends_discoverability_and_qr.sql)
  // is SELECT-only for `authenticated` -- no DELETE policy, no DELETE grant -- and wasn't attempted
  // at all before this. Same treatment as profiles/food_sightings: attempted, denial doesn't fail ok.
  it("qr_tokens-only denial is also undeletable, not a retryable failure", async () => {
    const c = client({ qr_tokens: { message: "permission denied" } });
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(true);
    expect(result.failedSteps).toEqual([]);
    expect(result.undeletableSteps).toEqual(["qr_tokens"]);
  });

  it("all three known-undeletable steps denied at once -- still ok, all three reported", async () => {
    const c = client({ profiles: { message: "denied" }, food_sightings: { message: "denied" }, qr_tokens: { message: "denied" } });
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(true);
    expect(result.undeletableSteps).toEqual(["profiles", "food_sightings", "qr_tokens"]);
  });

  // Per-step red evidence for each retryable step: a failure on ANY of them must still surface as
  // a genuine, retryable failure (unlike profiles/food_sightings above).
  it.each(RETRYABLE_STEPS)("reports a %s failure as retryable, without aborting the other steps", async (step) => {
    const c = client({ [errorKeyFor(step)]: { message: "permission denied" } });
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(false);
    expect(result.failedSteps).toEqual([step]);
    expect(result.undeletableSteps).toEqual([]);
    expect(c._calls).toEqual([...CALL_TABLES]);
  });

  it("collects every failed retryable step, not just the first, alongside the undeletable ones", async () => {
    const c = client({
      friendships: { message: "x" },
      shared_stats: { message: "y" },
      profiles: { message: "denied" },
      food_sightings: { message: "denied" },
      qr_tokens: { message: "denied" },
    });
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(false);
    expect(result.failedSteps).toEqual(["friendships", "shared_stats"]);
    expect(result.undeletableSteps).toEqual(["profiles", "food_sightings", "qr_tokens"]);
  });

  // #272 part A, red-first: the "notifications" step didn't exist on main at all, so this whole
  // step (and the resurrection bug it fixes -- see deleteServerData.ts's own doc comment) was
  // missing. Failing red-first evidence: this test fails on main because "notifications" never
  // appears in failedSteps/_calls/_updates -- there's no such step to fail or succeed.
  it("#272: turns off notifications_enabled and discoverable, ordered before the push_tokens delete", async () => {
    const c = client({});
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(true);
    expect(c._updates.profiles).toEqual({ notifications_enabled: false, discoverable: false });
    // Order matters: a focus landing between these two steps must see notifications_enabled
    // already false, so favoriteFoodAlerts.ts's refresh() self-heal skips re-registering.
    expect(c._calls.indexOf("profiles")).toBeLessThan(c._calls.indexOf("push_tokens"));
  });

  it("#272: a notifications-step failure (profiles.update denied) is retryable, not undeletable -- distinct from the profiles DELETE step", async () => {
    const c = client({ "profiles:update": { message: "permission denied" } });
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(false);
    expect(result.failedSteps).toEqual(["notifications"]);
    // The separate profiles.delete() step is unaffected by the update-only denial -- it isn't
    // configured to fail here, so (unlike a real backend) it succeeds in this fake client.
    expect(result.undeletableSteps).toEqual([]);
  });

  it("catches a thrown rejection from a step and reports it as failed rather than crashing", async () => {
    const c = client({});
    c.from = (table: string) => {
      if (table === "friendships") {
        return { delete: () => ({ or: () => Promise.reject(new Error("network down")) }) };
      }
      const builder: Record<string, unknown> = {};
      builder.delete = () => builder;
      builder.update = () => builder;
      builder.eq = () => Promise.resolve({ error: null });
      return builder;
    };
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(false);
    expect(result.failedSteps).toEqual(["friendships"]);
  });

  it("pings deletion scopes to sender_id, not user_id -- only pings this user sent are targeted", async () => {
    const c = client({});
    let pingsEqArgs: unknown[] = [];
    const realFrom = c.from.bind(c);
    c.from = (table: string) => {
      const builder = realFrom(table);
      if (table === "pings") {
        const origEq = builder.eq.bind(builder);
        builder.eq = (...args: unknown[]) => {
          pingsEqArgs = args;
          return origEq(...args);
        };
      }
      return builder;
    };
    await deleteServerData(c, "me");
    expect(pingsEqArgs).toEqual(["sender_id", "me"]);
  });
});
