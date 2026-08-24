// #147: rank.tsx's choose() computed from render-closure rankedDishes/rankedFoods state and only
// advanced the pair after two awaited saves + getSession, with both choice buttons enabled
// throughout. A second tap landing before the first's saves resolved computed from the same stale
// base as the first, and its whole-blob save clobbered the first's write (last-write-wins) --
// CONFIRMED via probe: two rapid taps ended with comparisonCount 2, not the 4 two independently-
// landing comparisons should produce. Same conventions as logsScreen.test.tsx (module-scope storage
// singletons, mocks retrieved via `.mock.results[0].value`, useFocusEffect fired once via a module
// flag so refresh() actually runs instead of being a no-op).

jest.mock("../lib/sqliteStorage", () => ({
  SqliteLogStorage: jest.fn().mockImplementation(() => ({ getAllEntries: jest.fn().mockResolvedValue([]) })),
}));

jest.mock("../lib/rankingStorage", () => ({
  SqliteRankingStorage: jest.fn().mockImplementation(() => ({
    getRankedDishes: jest.fn().mockResolvedValue([]),
    getRankedFoods: jest.fn().mockResolvedValue([]),
    saveRankedDishes: jest.fn().mockResolvedValue(undefined),
    saveRankedFoods: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../lib/supabase", () => ({
  supabase: { auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) } },
}));

let mockFocusEffectFired = false;
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    if (!mockFocusEffectFired) {
      mockFocusEffectFired = true;
      callback();
    }
  },
}));

import renderer, { act } from "react-test-renderer";
import type { LogEntry, RankedDish } from "@udine/shared";
import RankScreen from "../app/rank";
import { Button } from "../components/ui";
import { SqliteLogStorage } from "./sqliteStorage";
import { SqliteRankingStorage } from "./rankingStorage";

// Module-top-level singletons in rank.tsx already ran by the time this line executes --
// importing RankScreen above is what loaded that module (same lazy-access pattern as
// hallMenu.test.tsx's mockAddEntry).
const mockGetAllEntries = (SqliteLogStorage as unknown as jest.Mock).mock.results[0].value.getAllEntries as jest.Mock;
const rankingStorageMock = (SqliteRankingStorage as unknown as jest.Mock).mock.results[0].value as {
  getRankedDishes: jest.Mock;
  getRankedFoods: jest.Mock;
  saveRankedDishes: jest.Mock;
  saveRankedFoods: jest.Mock;
};

function nutrition() {
  return {
    servingSize: "1 each",
    calories: 200,
    caloriesFromFat: 0,
    totalFatG: 1,
    satFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 0,
    totalCarbG: 1,
    dietaryFiberG: 0,
    sugarsG: 0,
    proteinG: 1,
  };
}

function loggedEntry(dishName: string, hallTid: number): LogEntry {
  return {
    id: dishName,
    loggedAt: "2026-08-23T12:00:00.000",
    source: { type: "umass-menu", dishName, hallTid },
    servings: 1,
    nutrition: nutrition(),
  };
}

async function renderScreen() {
  mockGetAllEntries.mockResolvedValue([loggedEntry("Pizza", 1), loggedEntry("Salad", 1)]);
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<RankScreen />);
  });
  return root;
}

function findChoiceButton(root: renderer.ReactTestRenderer, dishName: RegExp) {
  const match = root.root.findAllByType(Button).find((n) => typeof n.props.children === "string" && dishName.test(n.props.children));
  if (!match) throw new Error(`No choice button matching ${dishName} -- did the pair render?`);
  return match;
}

beforeEach(() => {
  mockFocusEffectFired = false;
  rankingStorageMock.getRankedDishes.mockResolvedValue([]);
  rankingStorageMock.getRankedFoods.mockResolvedValue([]);
  rankingStorageMock.saveRankedFoods.mockResolvedValue(undefined);
});

it("serializes two rapid taps on the same choice so both comparisons land, instead of the second's stale-base save clobbering the first (#147)", async () => {
  const root = await renderScreen();

  // Deferred, per-call: the first choose() call's save must still be in flight when the second tap
  // fires, the exact window in which the pre-fix code would compute from the same stale
  // rankedDishes snapshot as the first.
  const resolvers: Array<() => void> = [];
  rankingStorageMock.saveRankedDishes.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolvers.push(resolve);
      }),
  );

  const pizzaButton = findChoiceButton(root, /^Pizza/);

  await act(async () => {
    pizzaButton.props.onPress(); // starts the first comparison
    pizzaButton.props.onPress(); // fires before the first's save resolves
    await Promise.resolve();
    await Promise.resolve();
  });

  // Serialized, not concurrent: the second call's body hasn't started yet, so only one save is
  // in flight so far.
  expect(rankingStorageMock.saveRankedDishes).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolvers[0](); // let the first comparison's save settle -- the queue advances to the second
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(rankingStorageMock.saveRankedDishes).toHaveBeenCalledTimes(2);

  await act(async () => {
    resolvers[1]();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  // Both comparisons landed on top of each other (not the second overwriting the first with an
  // equivalent single-increment result): winner + loser each gain 1 comparisonCount per tap, so two
  // taps sum to 4 across the pair. The CONFIRMED bug landed here at 2 (only one tap's effect survived).
  const finalDishes = rankingStorageMock.saveRankedDishes.mock.calls.at(-1)![0] as RankedDish[];
  const totalComparisons = finalDishes.reduce((sum, d) => sum + d.comparisonCount, 0);
  expect(totalComparisons).toBe(4);
});
