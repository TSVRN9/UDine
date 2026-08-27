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
import { Text } from "react-native";
import type { LogEntry, RankedDish } from "@udine/shared";
import RankScreen from "../app/rank";
import { Button } from "../components/ui";
import { SqliteLogStorage } from "./sqliteStorage";
import { SqliteRankingStorage } from "./rankingStorage";
import { __resetRetailNamesForTest, recordRetailNames } from "./retailHallNames";

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

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .join(" ");
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

// #165 (follow-up from PR #164's review): choose()'s guard still releases in `finally` when a
// save rejects (#162), but until now the rejection itself propagated out of the un-awaited
// onPress as an unhandled promise rejection -- rank.tsx was never in #158's {error}-surfacing
// scope. choose() now catches the failed save and surfaces it as visible text on the compare
// card (rank.tsx has no banner infra, so this is the smallest feedback that fits) instead of
// letting it propagate. Proven here: pressing no longer rejects, the error text renders, and a
// second tap still lands (proving the guard released despite the caught throw, not just that the
// promise resolved).
it("catches a rejected save, surfaces it as visible text instead of an unhandled rejection, and still releases the choosing guard so a subsequent tap applies a comparison (#162, #165)", async () => {
  const root = await renderScreen();

  // Reset call count/implementation -- the previous test left a deferred, never-settled
  // implementation and its own call recorded on this same jest.fn() (no resetMocks configured,
  // see jest.config.js).
  rankingStorageMock.saveRankedDishes.mockReset().mockResolvedValue(undefined);
  rankingStorageMock.saveRankedDishes.mockRejectedValueOnce(new Error("disk full"));

  const pizzaButton = findChoiceButton(root, /^Pizza/);
  await act(async () => {
    // No longer rejects -- choose() catches the failed save internally.
    await pizzaButton.props.onPress();
  });

  expect(rankingStorageMock.saveRankedDishes).toHaveBeenCalledTimes(1);
  expect(texts(root)).toMatch(/Couldn't save.*disk full/);

  // The throw happened before setPair could advance the displayed pair, so the same buttons are
  // still showing -- re-find them (react-test-renderer's tree may have re-rendered from the
  // intermediate setRankedDishes call) and press again.
  const pizzaButtonAgain = findChoiceButton(root, /^Pizza/);
  await act(async () => {
    await pizzaButtonAgain.props.onPress();
  });

  // A second, real save landing at all (not dropped as "still in flight") proves the guard
  // released despite the caught throw.
  expect(rankingStorageMock.saveRankedDishes).toHaveBeenCalledTimes(2);
  // A successful comparison clears the earlier error instead of leaving it stuck on screen.
  expect(texts(root)).not.toMatch(/Couldn't save/);
});

// #167 (PR #166 review nit): choose() clears chooseError on its next attempt (see the test above),
// but skip() didn't -- a stale "Couldn't save" message from a prior failed choose() would sit under
// the freshly dealt pair with no failed action of its own to explain it.
it("clears a stale chooseError when Skip is pressed, instead of leaving it under the freshly-dealt pair (#167)", async () => {
  const root = await renderScreen();

  rankingStorageMock.saveRankedDishes.mockRejectedValueOnce(new Error("disk full"));
  const pizzaButton = findChoiceButton(root, /^Pizza/);
  await act(async () => {
    await pizzaButton.props.onPress();
  });
  expect(texts(root)).toMatch(/Couldn't save.*disk full/);

  const skipButton = root.root
    .findAllByType(Button)
    .find((n) => typeof n.props.children === "string" && n.props.children === "Skip");
  if (!skipButton) throw new Error("No Skip button found");
  act(() => {
    skipButton.props.onPress();
  });

  expect(texts(root)).not.toMatch(/Couldn't save/);
});

// #243 bug A: rank.tsx's comparison-pair and ranked-dish-list labels call hallNameFor directly on
// a RankedDish/Dish's hallTid, which can be a café tid (loggable since #219) -- neither
// DINING_HALLS nor GRAB_N_GO_TIDS knows those names, so the button/row fell back to "Hall <tid>".
describe("café (retail) hall labels (#243 bug A)", () => {
  beforeEach(() => {
    mockFocusEffectFired = false;
    __resetRetailNamesForTest();
  });

  it("shows the café's real name on a comparison pair's choice button instead of 'Hall <tid>'", async () => {
    recordRetailNames([{ name: "People's Organic Coffee", hours: null, locationId: 32 }]);
    mockGetAllEntries.mockResolvedValue([loggedEntry("Pizza", 1), loggedEntry("Coffee", 32)]);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<RankScreen />);
    });

    expect(texts(root)).toMatch(/Coffee \(People's Organic Coffee\)/);
    expect(texts(root)).not.toMatch(/Hall 32/);
  });
});
