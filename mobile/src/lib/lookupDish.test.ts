import { labelLookupCandidate, lookupDishLive, type LookupDishCandidate } from "./lookupDish";

function candidate(dishName: string, location: string, hallTid = 1): LookupDishCandidate {
  return {
    dishName,
    location,
    hallTid,
    nutrition: {
      servingSize: "1 each",
      calories: 100,
      caloriesFromFat: 0,
      totalFatG: 0,
      satFatG: 0,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 0,
      dietaryFiberG: 0,
      sugarsG: 0,
      proteinG: 0,
    },
    allergens: [],
    dietTags: [],
  };
}

function stubSupabase(invoke: (name: string, opts: { body: unknown }) => Promise<{ data: unknown; error: unknown }>) {
  return { functions: { invoke } } as unknown as Parameters<typeof lookupDishLive>[0];
}

describe("lookupDishLive", () => {
  it("passes the query through and returns a hit's candidates", async () => {
    const candidates = [candidate("Bacon", "Worcester Dining Commons")];
    let capturedBody: unknown;
    const supabase = stubSupabase(async () => ({ data: { status: "hit", candidates }, error: null }));
    (supabase.functions.invoke as jest.Mock) = jest.fn(async (_name: string, opts: { body: unknown }) => {
      capturedBody = opts.body;
      return { data: { status: "hit", candidates }, error: null };
    });
    const result = await lookupDishLive(supabase, "Bacon");
    if (result.status !== "hit") throw new Error(`expected hit, got ${JSON.stringify(result)}`);
    expect(result.candidates).toEqual(candidates);
    expect(capturedBody).toEqual({ query: "Bacon" });
  });

  it("maps a miss response to status miss", async () => {
    const supabase = stubSupabase(async () => ({ data: { status: "miss" }, error: null }));
    const result = await lookupDishLive(supabase, "Nonexistent Dish");
    expect(result).toEqual({ status: "miss" });
  });

  it("maps an honest server rate_limited response through as-is", async () => {
    const supabase = stubSupabase(async () => ({ data: { status: "rate_limited", reason: "budget_exhausted" }, error: null }));
    const result = await lookupDishLive(supabase, "Bacon");
    expect(result).toEqual({ status: "rate_limited" });
  });

  it("folds a supabase-js invoke error into rate_limited -- the same honest 'not now' as a real budget-exhausted response", async () => {
    const supabase = stubSupabase(async () => ({ data: null, error: new Error("network down") }));
    const result = await lookupDishLive(supabase, "Bacon");
    expect(result).toEqual({ status: "rate_limited" });
  });

  it("folds a thrown exception (e.g. offline) into rate_limited, never lets it escape uncaught", async () => {
    const supabase = stubSupabase(async () => {
      throw new Error("offline");
    });
    const result = await lookupDishLive(supabase, "Bacon");
    expect(result).toEqual({ status: "rate_limited" });
  });
});

describe("labelLookupCandidate", () => {
  it("returns the plain dish name when it's the only candidate", () => {
    const c = candidate("Bacon", "Worcester Dining Commons");
    expect(labelLookupCandidate(c, [c])).toBe("Bacon");
  });

  it("appends the location when more than one candidate shares the exact dish name", () => {
    const a = candidate("Bacon", "Worcester Dining Commons");
    const b = candidate("Bacon", "Franklin Dining Commons");
    expect(labelLookupCandidate(a, [a, b])).toBe("Bacon (Worcester Dining Commons)");
    expect(labelLookupCandidate(b, [a, b])).toBe("Bacon (Franklin Dining Commons)");
  });

  it("does not disambiguate candidates with different names even in the same result set", () => {
    const a = candidate("Bacon", "Worcester Dining Commons");
    const b = candidate("Canadian Bacon", "Worcester Dining Commons");
    expect(labelLookupCandidate(a, [a, b])).toBe("Bacon");
    expect(labelLookupCandidate(b, [a, b])).toBe("Canadian Bacon");
  });
});
