// #115: covers what's actually NEW in grab-n-go/[slug].tsx relative to the hall-menu screen it
// otherwise reuses wholesale (plate wiring, logged-banner lifecycle, favoriting, nutrition label are
// all already covered by hallMenu.test.tsx against the exact same shared code paths -- duplicating
// those here would just be the same assertions against the same lib/plate.ts functions). This file
// only exercises: (1) fetchMenu is called with the Grab 'N Go tid, not the hall's own tid, (2) menu
// items are grouped into sections by station/category, not by meal period like the hall screen, and
// (3) the date stepper advances the day and re-fetches.

jest.mock("../lib/sqliteStorage", () => ({
  SqliteLogStorage: jest.fn().mockImplementation(() => ({ addEntry: jest.fn() })),
}));

jest.mock("../lib/favoritesStorage", () => ({
  SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({
    getFavorites: jest.fn().mockResolvedValue([]),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
  })),
  // #198: useGuardedToggleFavorite is pure logic against the (mocked) storage interface above --
  // keep it real, same pattern as SocialPane.test.tsx's real isTransientPingError.
  useGuardedToggleFavorite: jest.requireActual("../lib/favoritesStorage").useGuardedToggleFavorite,
}));

jest.mock("../lib/preferences", () => ({
  getPreferences: jest.fn().mockResolvedValue({ allergensToAvoid: [], requiredDietTags: [] }),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ slug: "hampshire" }),
  useFocusEffect: (_callback: () => void) => {},
  router: { back: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchMenu: jest.fn(),
  fetchDiningHours: jest.fn().mockResolvedValue({ halls: [], retail: [] }),
}));

import renderer, { act } from "react-test-renderer";
import { Text, SectionList } from "react-native";
import { fetchDiningHours, fetchMenu, GRAB_N_GO_TIDS, type MenuItem } from "@udine/shared";
import GrabNGoScreen from "../app/grab-n-go/[slug]";
import { PlateBar } from "../components/PlateBar";
import { Button } from "../components/ui";
import { SqliteLogStorage } from "./sqliteStorage";

const mockedFetchMenu = fetchMenu as jest.Mock;
const mockedFetchDiningHours = fetchDiningHours as jest.Mock;
// grab-n-go/[slug].tsx's `const storage = new SqliteLogStorage();` (module top level) already ran
// by the time this line executes -- importing GrabNGoScreen above is what loaded that module. Same
// lazy-access pattern as hallMenu.test.tsx's mockAddEntry.
const mockAddEntry = (SqliteLogStorage as unknown as jest.Mock).mock.results[0].value.addEntry as jest.Mock;

function nutrition(calories: number): MenuItem["nutrition"] {
  return {
    servingSize: "1 each",
    calories,
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

function item(dishName: string, category: string, mealPeriod: MenuItem["mealPeriod"]): MenuItem {
  return {
    dishName,
    category,
    mealPeriod,
    hallTid: GRAB_N_GO_TIDS.hampshire,
    date: "2026-09-02",
    nutrition: nutrition(150),
    allergens: [],
    dietTags: [],
  };
}

async function renderScreen(items: MenuItem[]) {
  mockedFetchMenu.mockResolvedValue(items);
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<GrabNGoScreen />);
  });
  return root;
}

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

it("fetches the hall's Grab 'N Go tid, not its regular hall tid", async () => {
  await renderScreen([]);
  expect(mockedFetchMenu).toHaveBeenCalledWith(GRAB_N_GO_TIDS.hampshire, expect.any(Date));
});

it("groups sections by station/category, not by meal period like the hall-menu screen -- items from different meal-period buckets sharing a category land in ONE section", async () => {
  // Same category, "Grab n'Go Hot ", appearing under two different mealPeriod keys (a real shape the
  // feed can return -- see docs/apk-reverse-engineering.md/#115's issue comment) must not become two
  // separate sections the way the hall screen's per-mealPeriod grouping would.
  const root = await renderScreen([item("Chicken Wrap", "Grab n'Go Hot ", "lunch"), item("Egg Sandwich", "Grab n'Go Hot ", "breakfast")]);

  const sectionTitles = root.root.findByType(SectionList).props.sections.map((s: { title: string }) => s.title);
  expect(sectionTitles).toEqual(["Grab n'Go Hot"]); // trimmed, deduped -- one section, not two

  const body = texts(root).flat().join(" ");
  expect(body).toMatch(/Chicken Wrap/);
  expect(body).toMatch(/Egg Sandwich/);
});

it("keeps distinct categories as distinct sections", async () => {
  const root = await renderScreen([item("Chicken Wrap", "Grab n'Go Hot ", "lunch"), item("Fruit Cup", "Grab n'Go Cold ", "lunch")]);
  const sectionTitles = root.root.findByType(SectionList).props.sections.map((s: { title: string }) => s.title);
  expect(sectionTitles).toEqual(["Grab n'Go Hot", "Grab n'Go Cold"]);
});

it("the date stepper's next-day button advances the fetched date by one day", async () => {
  const root = await renderScreen([item("Chicken Wrap", "Grab n'Go Hot ", "lunch")]);
  const firstCallDate = mockedFetchMenu.mock.calls[mockedFetchMenu.mock.calls.length - 1][1] as Date;

  await act(async () => {
    root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
  });

  const secondCallDate = mockedFetchMenu.mock.calls[mockedFetchMenu.mock.calls.length - 1][1] as Date;
  expect(secondCallDate.getTime() - firstCallDate.getTime()).toBe(24 * 60 * 60 * 1000);
});

it("clears a previous date's fetch error once a later date's fetch succeeds, instead of pinning the error screen", async () => {
  mockedFetchMenu.mockRejectedValueOnce(new Error("network down"));
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<GrabNGoScreen />);
  });
  expect(texts(root).flat().join(" ")).toMatch(/Failed to load menu:.*network down/);

  mockedFetchMenu.mockResolvedValueOnce([item("Chicken Wrap", "Grab n'Go Hot ", "lunch")]);
  await act(async () => {
    root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
  });

  expect(texts(root).flat().join(" ")).not.toMatch(/Failed to load menu/);
  expect(texts(root).flat().join(" ")).toMatch(/Chicken Wrap/);
});

// #130 item 1: stale-response guard, ported from #117's hall-menu screen (halls/[slug].tsx). Two
// quick date-stepper taps fire two fetches, and network order isn't request order -- an in-flight
// response for a date the user already stepped away from must not overwrite the current one.
it("does not let a slow, stale fetch for a date the user already stepped away from overwrite the current date's items", async () => {
  let resolveFirst!: (items: MenuItem[]) => void;
  mockedFetchMenu.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));

  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<GrabNGoScreen />);
  });

  // Second fetch (today -> +1 day) resolves first, "winning" the race.
  mockedFetchMenu.mockResolvedValueOnce([item("Egg Sandwich", "Grab n'Go Hot ", "breakfast")]);
  await act(async () => {
    root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
  });

  // The original (stale) fetch for the first date now resolves late.
  await act(async () => {
    resolveFirst([item("Chicken Wrap", "Grab n'Go Hot ", "lunch")]);
  });

  const body = texts(root).flat().join(" ");
  expect(body).toMatch(/Egg Sandwich/);
  expect(body).not.toMatch(/Chicken Wrap/);
});

// Same guard, the reject arm: a stale fetch that eventually FAILS (e.g. a slow request that times
// out) must not paint the error screen over a newer date's already-loaded menu either.
it("does not let a slow, stale fetch's eventual error overwrite a newer date's already-loaded items", async () => {
  let rejectFirst!: (err: Error) => void;
  mockedFetchMenu.mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectFirst = reject)));

  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<GrabNGoScreen />);
  });

  mockedFetchMenu.mockResolvedValueOnce([item("Egg Sandwich", "Grab n'Go Hot ", "breakfast")]);
  await act(async () => {
    root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
  });

  await act(async () => {
    rejectFirst(new Error("network down"));
  });

  const body = texts(root).flat().join(" ");
  expect(body).not.toMatch(/Failed to load menu/);
  expect(body).toMatch(/Egg Sandwich/);
});

// #130 item 2: header subtitle is date-aware. get_infov2 (and therefore hoursFeed) only ever
// publishes TODAY's hours, so showing it against a stepped-to date paints a confidently wrong
// "open now · until ..." over a menu that isn't today's. Cleanest fix (matches #117's sibling
// mealTabSubtitle, which gates the hall-menu tab-row subtitle the same way): omit the subtitle
// entirely once the user steps off today, rather than showing today's hours mislabeled.
it("omits the header subtitle once the date stepper moves off today, since hoursFeed only ever covers today", async () => {
  mockedFetchDiningHours.mockResolvedValueOnce({
    halls: [],
    retail: [{ name: "Hampshire Grab ‘N Go", hours: { openTime: "12:00 AM", closeTime: "11:59 PM" } }],
  });

  const root = await renderScreen([item("Chicken Wrap", "Grab n'Go Hot ", "lunch")]);
  expect(texts(root).flat().join(" ")).toMatch(/open now/);

  await act(async () => {
    root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
  });

  expect(texts(root).flat().join(" ")).not.toMatch(/open now/);
});

// #130 item 3: duplicate-category merge. The same dish can appear in the feed under two different
// mealPeriod values sharing one trimmed category (a real feed shape -- see the earlier "groups
// sections by station/category" test) -- when it's ALSO the same dish (same plate key), rendering
// both would put two identical rows sharing one plate stepper in the section.
it("dedupes a dish that appears twice in the same category (same plate key) into a single row", async () => {
  const root = await renderScreen([
    item("Chicken Wrap", "Grab n'Go Hot ", "lunch"),
    item("Chicken Wrap", "Grab n'Go Hot ", "breakfast"),
  ]);

  const sections = root.root.findByType(SectionList).props.sections as { title: string; data: MenuItem[] }[];
  expect(sections).toHaveLength(1);
  expect(sections[0].data).toHaveLength(1);
});

// #130 item 6 (found by PR #132's review, the same #111 bug family): logPlate must stamp loggedAt
// with LOCAL time, not `.toISOString()` (UTC) -- an evening entry (local time still today, UTC
// already tomorrow) would otherwise file under tomorrow and vanish from Today's list. Mirrors
// hallMenu.test.tsx's own #111 regression test.
it("logs an evening entry under today's LOCAL calendar day, not the UTC-rolled-over day (issue #111 bug family)", async () => {
  jest.useFakeTimers();
  try {
    // 11:30 PM Eastern on Aug 20 is already 3:30 AM UTC on Aug 21. Assumes Eastern time -- pinned
    // suite-wide via mobile/package.json's `test` script (`TZ=America/New_York jest`).
    jest.setSystemTime(new Date("2026-08-21T03:30:00.000Z"));
    mockAddEntry.mockReset().mockResolvedValue(undefined);

    const root = await renderScreen([item("Chicken Wrap", "Grab n'Go Hot ", "lunch")]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Add Chicken Wrap to plate" }).props.onPress();
    });
    act(() => {
      root.root.findByType(PlateBar).props.onPress();
    });
    const button = root.root.findAllByType(Button).find((n) => typeof n.props.children === "string" && /^LOG \d+ ITEMS?$/.test(n.props.children));
    if (!button) throw new Error("LOG N ITEMS button not found -- is the sheet actually open?");
    await act(async () => {
      await button.props.onPress();
    });

    expect(mockAddEntry).toHaveBeenCalledTimes(1);
    const [entry] = mockAddEntry.mock.calls[0];
    expect(entry.loggedAt.startsWith("2026-08-20")).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
