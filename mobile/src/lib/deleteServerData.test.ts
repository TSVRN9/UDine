import { deleteServerData } from "./deleteServerData";

function client(errors: Partial<Record<"friendships" | "favorited_foods" | "shared_stats" | "profiles", unknown>>) {
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
  it("deletes all four tables and reports ok when every step succeeds", async () => {
    const c = client({});
    const result = await deleteServerData(c, "me");
    expect(result).toEqual({ ok: true, failedSteps: [] });
    expect(c._calls).toEqual(["friendships", "favorited_foods", "shared_stats", "profiles"]);
  });

  it("reports profiles as a failed step when its RLS delete is denied, without aborting the other three", async () => {
    const c = client({ profiles: { message: "permission denied" } });
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(false);
    expect(result.failedSteps).toEqual(["profiles"]);
    // The other three tables were still attempted -- a profiles-only RLS gap doesn't block them.
    expect(c._calls).toContain("friendships");
    expect(c._calls).toContain("favorited_foods");
    expect(c._calls).toContain("shared_stats");
  });

  it("collects every failed step, not just the first", async () => {
    const c = client({ friendships: { message: "x" }, shared_stats: { message: "y" } });
    const result = await deleteServerData(c, "me");
    expect(result.ok).toBe(false);
    expect(result.failedSteps).toEqual(["friendships", "shared_stats"]);
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
});
