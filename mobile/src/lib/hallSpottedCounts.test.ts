import { DINING_HALLS, GRAB_N_GO_TIDS } from "@udine/shared";

import { hallSpottedCounts } from "./hallSpottedCounts";

// Same mocking boundaries as backgroundTask.test.ts's own signed-out/signed-in split: ./supabase
// (getSession + .from) and ./sightingDedup (the signed-out local data source) are the only two
// seams hallSpottedCounts.ts reaches through.
const mockGetSession = jest.fn();
const mockSelectResult = jest.fn();
jest.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: (...args: []) => mockGetSession(...args) },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (col1: string, val1: unknown) => ({
          eq: (col2: string, val2: unknown) => mockSelectResult(table, columns, col1, val1, col2, val2),
        }),
      }),
    }),
  },
}));

const mockCountsByHallToday = jest.fn<Promise<Map<number, number>>, [string]>();
jest.mock("./sightingDedup", () => ({
  countsByHallToday: (...args: [string]) => mockCountsByHallToday(...args),
}));

const worcester = DINING_HALLS.find((h) => h.slug === "worcester")!;
const hampshire = DINING_HALLS.find((h) => h.slug === "hampshire")!;
const worcesterGng = GRAB_N_GO_TIDS.worcester;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 8, 15)); // 2026-09-15 local
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } });
  mockSelectResult.mockReset().mockResolvedValue({ data: [] });
  mockCountsByHallToday.mockReset().mockResolvedValue(new Map());
});

afterEach(() => {
  jest.useRealTimers();
});

describe("signed out", () => {
  it("reads counts from the local dedup store for today's date", async () => {
    mockCountsByHallToday.mockResolvedValue(new Map([[worcester.tid, 2]]));

    await expect(hallSpottedCounts()).resolves.toEqual(new Map([[worcester.tid, 2]]));
    expect(mockCountsByHallToday).toHaveBeenCalledWith("2026-09-15");
  });

  it("rolls a Grab 'N Go tid's count into its parent hall's tid", async () => {
    mockCountsByHallToday.mockResolvedValue(
      new Map([
        [worcester.tid, 1],
        [worcesterGng, 1],
      ]),
    );

    await expect(hallSpottedCounts()).resolves.toEqual(new Map([[worcester.tid, 2]]));
  });

  it("never calls the signed-in food_sightings path", async () => {
    await hallSpottedCounts();
    expect(mockSelectResult).not.toHaveBeenCalled();
  });

  it("drops a tid that is neither a hall nor a Grab 'N Go tid -- Cafés & Markets never get a badge", async () => {
    mockCountsByHallToday.mockResolvedValue(
      new Map([
        [worcester.tid, 1],
        [9999, 5],
      ]),
    );

    await expect(hallSpottedCounts()).resolves.toEqual(new Map([[worcester.tid, 1]]));
  });
});

describe("signed in", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
  });

  it("reads counts from food_sightings, scoped to the signed-in user and today's date", async () => {
    mockSelectResult.mockResolvedValue({ data: [{ hall_tid: hampshire.tid }] });

    await expect(hallSpottedCounts()).resolves.toEqual(new Map([[hampshire.tid, 1]]));
    expect(mockSelectResult).toHaveBeenCalledWith("food_sightings", "hall_tid", "user_id", "user-1", "sighted_date", "2026-09-15");
  });

  it("counts multiple rows for the same hall", async () => {
    mockSelectResult.mockResolvedValue({
      data: [{ hall_tid: worcester.tid }, { hall_tid: worcester.tid }, { hall_tid: hampshire.tid }],
    });

    await expect(hallSpottedCounts()).resolves.toEqual(
      new Map([
        [worcester.tid, 2],
        [hampshire.tid, 1],
      ]),
    );
  });

  it("rolls a Grab 'N Go tid's rows into its parent hall's tid", async () => {
    mockSelectResult.mockResolvedValue({
      data: [{ hall_tid: worcester.tid }, { hall_tid: worcesterGng }],
    });

    await expect(hallSpottedCounts()).resolves.toEqual(new Map([[worcester.tid, 2]]));
  });

  it("drops a tid that is neither a hall nor a Grab 'N Go tid -- Cafés & Markets never get a badge", async () => {
    mockSelectResult.mockResolvedValue({
      data: [{ hall_tid: worcester.tid }, { hall_tid: 9999 }],
    });

    await expect(hallSpottedCounts()).resolves.toEqual(new Map([[worcester.tid, 1]]));
  });

  it("never calls the signed-out local dedup path", async () => {
    await hallSpottedCounts();
    expect(mockCountsByHallToday).not.toHaveBeenCalled();
  });

  // notifications_enabled=false means the server-side check-favorited-foods pipeline never writes a
  // food_sightings row for this user in the first place (CLAUDE.md's residency row) -- no rows is
  // the ordinary, non-error shape here, so it must resolve to an empty map, not surface as a failure.
  it("a user with no food_sightings rows (e.g. notifications_enabled off) simply sees no badges", async () => {
    mockSelectResult.mockResolvedValue({ data: [] });

    await expect(hallSpottedCounts()).resolves.toEqual(new Map());
  });
});

it("degrades to an empty map (no badges, not an error) when the session check throws", async () => {
  mockGetSession.mockRejectedValue(new Error("network down"));

  await expect(hallSpottedCounts()).resolves.toEqual(new Map());
});
