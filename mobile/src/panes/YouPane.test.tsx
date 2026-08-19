import type { ReactNode } from "react";

// Same rationale as FirstRunCard.test.tsx/index.test.tsx: explicit factories, not bare automocks --
// the real ../lib/supabase, ../lib/sqliteStorage, ../lib/rankingStorage, and ../lib/seenDishesStorage
// all drag in native bindings (Supabase client validation, expo-sqlite) unavailable outside
// jest-expo's native harness. Each storage's jest.fn()s are created *inside* its factory (not
// referenced from an outer `const mock... = jest.fn()`) -- YouPane.tsx instantiates each storage
// eagerly at module scope, and a factory that instead closed over an outer-scope mock var would
// capture it before it's initialized (Babel hoists the compiled `require` for YouPane's own imports
// above other top-level statements in this file -- see menuFetchWithSeenTracking.test.ts's comment
// on the same hazard). Below, a second `new SqliteLogStorage()` etc. (mirroring index.test.tsx's
// `firstRun as jest.Mocked<typeof firstRun>` pattern, adapted for a class) grabs the exact same
// jest.fn() references the factory closed over -- every mockImplementation() call returns a fresh
// wrapper object around the *same* fns, so this is the same mock YouPane.tsx's own singleton uses.
jest.mock("../lib/sqliteStorage", () => {
  const getAllEntries = jest.fn().mockResolvedValue([]);
  const removeEntry = jest.fn().mockResolvedValue(undefined);
  return { SqliteLogStorage: jest.fn().mockImplementation(() => ({ getAllEntries, removeEntry })) };
});

jest.mock("../lib/rankingStorage", () => {
  const getRankedDishes = jest.fn().mockResolvedValue([]);
  const getRankedFoods = jest.fn().mockResolvedValue([]);
  return { SqliteRankingStorage: jest.fn().mockImplementation(() => ({ getRankedDishes, getRankedFoods })) };
});

jest.mock("../lib/seenDishesStorage", () => {
  const getAllSeenDishNames = jest.fn().mockResolvedValue(new Map());
  return { SqliteSeenDishesStorage: jest.fn().mockImplementation(() => ({ getAllSeenDishNames })) };
});

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

jest.mock("../lib/auth", () => ({
  signInWithGoogle: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("../lib/date", () => ({ todayIso: () => "2026-08-19" }));

jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///cache/", writeAsStringAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn().mockResolvedValue(false), shareAsync: jest.fn() }));

// YouPane always renders a Link (the Friends row) -- stub it flat since there's no navigator here.
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  useFocusEffect: (callback: () => void) => callback(),
}));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import type { RankedDish, RankedFood } from "@udine/shared";
import { YouPane } from "./YouPane";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { SqliteSeenDishesStorage } from "../lib/seenDishesStorage";

const logMock = new SqliteLogStorage() as unknown as { getAllEntries: jest.Mock; removeEntry: jest.Mock };
const rankingMock = new SqliteRankingStorage() as unknown as { getRankedDishes: jest.Mock; getRankedFoods: jest.Mock };
const seenMock = new SqliteSeenDishesStorage() as unknown as { getAllSeenDishNames: jest.Mock };

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children).flat().join(" ");
}

async function renderYouPane() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<YouPane activeIndex={2} />);
  });
  // Flush the storage promises + resulting re-render (useFocusEffect fires synchronously above,
  // but the storage .then() callbacks still resolve on a microtask).
  await act(async () => {
    await Promise.resolve();
  });
  return root;
}

// Two dishes at the same hall (>= ranking.ts's MIN_RATED_DISHES_PER_HALL) so rankDiningHalls ranks it.
const rankedDishesForOneRankedHall: RankedDish[] = [
  { dishName: "A", hallTid: 1, rating: 1500, comparisonCount: 3 },
  { dishName: "B", hallTid: 1, rating: 1600, comparisonCount: 3 },
];

beforeEach(() => {
  logMock.getAllEntries.mockResolvedValue([]);
  rankingMock.getRankedDishes.mockResolvedValue([]);
  rankingMock.getRankedFoods.mockResolvedValue([]);
  seenMock.getAllSeenDishNames.mockResolvedValue(new Map());
});

describe("YouPane", () => {
  it("shows the fully-empty state: no log, no comparisons, no ranking", async () => {
    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Nothing logged yet/);
    expect(body).toMatch(/No comparisons yet/);
    expect(body).toMatch(/No ranking yet/);
  });

  it("shows the in-between state: halls ranked but no food has enough comparisons for a score yet (carry-over note 2)", async () => {
    rankingMock.getRankedDishes.mockResolvedValue(rankedDishesForOneRankedHall);
    const belowGate: RankedFood[] = [{ dishName: "Tofu Stir Fry", rating: 1550, comparisonCount: 1 }];
    rankingMock.getRankedFoods.mockResolvedValue(belowGate);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Almost there/);
    expect(body).not.toMatch(/No comparisons yet/);
    expect(body).not.toMatch(/No ranking yet/);
    expect(body).toMatch(/Worcester/); // hallTid 1
  });

  it("shows the populated state: today's log, a qualifying top food, and a favorite hall", async () => {
    logMock.getAllEntries.mockResolvedValue([
      {
        id: "1",
        loggedAt: "2026-08-19T12:00:00.000Z",
        source: { type: "umass-menu", dishName: "Chicken Parm", hallTid: 1 },
        servings: 1,
        nutrition: {
          servingSize: "1 serving",
          calories: 500,
          caloriesFromFat: 100,
          totalFatG: 11,
          satFatG: 3,
          transFatG: 0,
          cholesterolMg: 50,
          sodiumMg: 400,
          totalCarbG: 40,
          dietaryFiberG: 3,
          sugarsG: 5,
          proteinG: 30,
        },
      },
    ]);
    rankingMock.getRankedDishes.mockResolvedValue(rankedDishesForOneRankedHall);
    const qualifying: RankedFood[] = [{ dishName: "Chicken Parm", rating: 1650, comparisonCount: 5 }];
    rankingMock.getRankedFoods.mockResolvedValue(qualifying);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).not.toMatch(/Nothing logged yet/);
    expect(body).not.toMatch(/No comparisons yet/);
    expect(body).not.toMatch(/Almost there/);
    expect(body).not.toMatch(/No ranking yet/);
    expect(body).toMatch(/Chicken Parm/);
    expect(body).toMatch(/500/); // calorie total
  });
});
