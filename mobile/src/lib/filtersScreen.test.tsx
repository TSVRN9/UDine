// #191: filters.tsx's menu fetch (`Promise.all` over all 4 halls) had no `.catch` -- any hall
// rejecting left `allergens` null forever, so the ActivityIndicator spun indefinitely. This covers
// the fix: a fetch failure renders #181's MenuErrorCard (retry state) instead of spinning forever,
// and TRY AGAIN refetches successfully.

jest.mock("../lib/preferences", () => ({
  getPreferences: jest.fn().mockResolvedValue({ allergensToAvoid: [], requiredDietTags: [] }),
  setPreferences: jest.fn(),
}));

jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchMenu: jest.fn(),
}));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { fetchMenu, type MenuItem } from "@udine/shared";
import FiltersScreen from "../app/filters";

const mockedFetchMenu = fetchMenu as jest.Mock;

function item(allergens: string[], dietTags: string[]): MenuItem {
  return {
    hallTid: 1,
    mealPeriod: "Lunch",
    category: "Entrees",
    dishName: "Pizza",
    allergens,
    dietTags,
    nutrition: null,
  } as unknown as MenuItem;
}

function texts(root: renderer.ReactTestRenderer): string[] {
  return root.root.findAllByType(Text).map((n) => n.props.children).flat();
}

describe("FiltersScreen loading/error states (#191)", () => {
  beforeEach(() => {
    mockedFetchMenu.mockReset();
  });

  it("shows the retry card (not a stuck spinner) when a hall fetch fails, and TRY AGAIN refetches", async () => {
    mockedFetchMenu.mockRejectedValue(new Error("network down"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<FiltersScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const errorBody = texts(root).join(" ");
    expect(errorBody).toMatch(/Menu didn't load/);

    mockedFetchMenu.mockResolvedValue([item(["Peanuts"], ["Vegan"])]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Try again" }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    const retriedBody = texts(root).join(" ");
    expect(retriedBody).not.toMatch(/Menu didn't load/);
    expect(retriedBody).toMatch(/Peanuts/);
  });
});
