// #147: rank.tsx's choose() computed from render-closure rankedDishes/rankedFoods state and only
// advanced the displayed pair after two awaited saves + getSession, with both choice buttons
// enabled throughout. A second tap landing before the first's saves resolved computed from the
// same stale base as the first, and its whole-blob save clobbered the first's write (last-write-
// wins). The displayed pair is frozen for the whole guard window (setPair is the LAST statement in
// choose()), so a second tap inside that window can only ever be the same button re-tapped by
// accident, or the other button mis-tapped on a pair the user hasn't seen change -- never a distinct
// judgement on a different pair. Dropped, not queued (PR #159 review round 1: queuing serialized
// both taps' effects, which turns an accidental double-tap into two persisted, unrecoverable Elo
// updates -- comparisonCount feeds kFactorFor's taper, scores.ts's MIN_COMPARISONS_FOR_SCORE gate,
// and pickLeastCompared's pair selection, so an inflated count isn't cosmetic). Same conventions as
// logsScreen.test.tsx (module-scope storage singletons, mocks retrieved via
// `.mock.results[0].value`, useFocusEffect fired once via a module flag so refresh() actually runs
// instead of being a no-op).

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

it("drops a rapid second tap on the same still-displayed pair while the first comparison's save is still in flight, instead of applying a second comparison on top of it (#147)", async () => {
  const root = await renderScreen();

  // The first choose() call's save must still be in flight when the second tap fires -- the exact
  // window in which the pre-fix code would compute from the same stale rankedDishes snapshot as
  // the first (and, pre-review-round-1, the window a queuing fix would apply a second comparison
  // in, on a pair the user was never shown as having changed).
  let resolveSave!: () => void;
  rankingStorageMock.saveRankedDishes.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
  );

  const pizzaButton = findChoiceButton(root, /^Pizza/);

  await act(async () => {
    pizzaButton.props.onPress(); // starts the guarded comparison
    pizzaButton.props.onPress(); // fires before the first's save resolves -- must be dropped
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(rankingStorageMock.saveRankedDishes).toHaveBeenCalledTimes(1);

  // Let the first comparison's save settle -- the guard must release, but there's nothing queued
  // behind it: a second, distinct save would mean the dropped tap secretly still landed.
  await act(async () => {
    resolveSave();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(rankingStorageMock.saveRankedDishes).toHaveBeenCalledTimes(1);

  // Exactly one comparison's worth of effect: winner + loser each gain 1 comparisonCount. The
  // pre-fix (queuing) code landed both taps' effects here, summing to 4.
  const finalDishes = rankingStorageMock.saveRankedDishes.mock.calls.at(-1)![0] as RankedDish[];
  const totalComparisons = finalDishes.reduce((sum, d) => sum + d.comparisonCount, 0);
  expect(totalComparisons).toBe(2);
});
