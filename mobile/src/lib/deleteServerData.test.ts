import { deleteServerData } from "./deleteServerData";

const RETRYABLE_TABLES = ["friendships", "favorited_foods", "shared_stats", "favorite_dining_halls", "push_tokens", "pings"] as const;
const UNDELETABLE_TABLES = ["profiles", "food_sightings", "qr_tokens"] as const;
const ALL_TABLES = [...RETRYABLE_TABLES, ...UNDELETABLE_TABLES] as const;

function client(errors: Partial<Record<(typeof ALL_TABLES)[number], unknown>>) {
  const calls: string[] = [];
  return {
    from(table: string) {
      calls.push(table);
      const builder: Record<string, unknown> = {};
      builder.delete = () => builder;
      builder.eq = () => Promise.resolve({ error: errors[table as keyof typeof errors] ?? null });
      builder.or = () => Promise.resolve({ error: errors[table as keyof typeof errors] ?? null });
      return builder;
    },
    _calls: calls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("deleteServerData", () => {
  it("attempts all nine tables, in order, when nothing errors", async () => {
    const c = client({});
    const result = await deleteServerData(c, "me");
    expect(result).toEqual({ ok: true, failedSteps: [], undeletableSteps: [] });
    expect(c._calls).toEqual([...ALL_TABLES]);
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
    // Still attempted, not silently skipped, and every other step still ran.
    expect(c._calls).toEqual([...ALL_TABLES]);
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

  // Per-table red evidence for each newly-added retryable step: a failure on ANY of them must
  // still surface as a genuine, retryable failure (unlike profiles/food_sightings above).
  it.each(RETRYABLE_TABLES)("reports a %s failure as retryable, without aborting the other steps", async (table) => {
    const c = client({ [table]: { message: "permission denied" } } as Partial<Record<(typeof ALL_TABLES)[number], unknown>>);
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(false);
    expect(result.failedSteps).toEqual([table]);
    expect(result.undeletableSteps).toEqual([]);
    expect(c._calls).toEqual([...ALL_TABLES]);
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

  it("catches a thrown rejection from a step and reports it as failed rather than crashing", async () => {
    const c = client({});
    c.from = (table: string) => {
      if (table === "friendships") {
        return { delete: () => ({ or: () => Promise.reject(new Error("network down")) }) };
      }
      const builder: Record<string, unknown> = {};
      builder.delete = () => builder;
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
