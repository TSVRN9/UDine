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
import { fetchMenu, GRAB_N_GO_TIDS, type MenuItem } from "@udine/shared";
import GrabNGoScreen from "../app/grab-n-go/[slug]";

const mockedFetchMenu = fetchMenu as jest.Mock;

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
