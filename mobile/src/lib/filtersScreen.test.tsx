// #191: filters.tsx's menu fetch (`Promise.all` over all 4 halls) had no `.catch` -- any hall
// rejecting left `allergens` null forever, so the ActivityIndicator spun indefinitely. This covers
// the fix: a fetch failure renders #181's MenuErrorCard (retry state) instead of spinning forever,
// and TRY AGAIN refetches successfully.

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { fetchMenu, type MenuItem } from "@udine/shared";
import FiltersScreen from "../app/filters";

jest.mock("../lib/preferences", () => ({
  getPreferences: jest.fn().mockResolvedValue({ allergensToAvoid: [], requiredDietTags: [] }),
  setPreferences: jest.fn(),
}));

jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchMenu: jest.fn(),
}));

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

  it("ignores a stale response from an earlier loadMenus() run when a later run settles first (generation guard)", async () => {
    mockedFetchMenu.mockRejectedValue(new Error("network down"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<FiltersScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(texts(root).join(" ")).toMatch(/Menu didn't load/);

    // Queue-based mock: each fetchMenu() call gets its own deferred promise, resolved manually
    // below in a chosen order to simulate two overlapping loadMenus() runs settling out of order.
    const resolvers: ((items: MenuItem[]) => void)[] = [];
    mockedFetchMenu.mockImplementation(
      () =>
        new Promise<MenuItem[]>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    // Double-tap TRY AGAIN before either run's promise settles -- same onPress instance (loadMenus
    // is a stable useCallback), fired twice within one act() with no await between, so the second
    // tap fires against the still-mounted retry card exactly like two fast real taps would. Each
    // run calls fetchMenu once per of the 4 halls, so resolvers[0..3] is the OLDER run (gen N) and
    // resolvers[4..7] is the NEWER run (gen N+1).
    const tryAgain = root.root.findByProps({ accessibilityLabel: "Try again" });
    act(() => {
      tryAgain.props.onPress(); // older run
      tryAgain.props.onPress(); // newer run
    });
    expect(resolvers.length).toBe(8);

    // Newer run settles first (its 4 hall calls).
    await act(async () => {
      resolvers.slice(4, 8).forEach((r) => r([item(["NEW"], ["Vegan"])]));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(texts(root).join(" ")).toMatch(/NEW/);

    // Older, now-stale run settles after -- must NOT clobber the newer run's already-rendered result.
    await act(async () => {
      resolvers.slice(0, 4).forEach((r) => r([item(["OLD"], ["Vegetarian"])]));
      await Promise.resolve();
      await Promise.resolve();
    });
    const finalBody = texts(root).join(" ");
    expect(finalBody).toMatch(/NEW/);
    expect(finalBody).not.toMatch(/OLD/);
  });
});
