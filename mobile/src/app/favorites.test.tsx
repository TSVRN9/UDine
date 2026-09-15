// Copy-only rename (docs/briefs/favorites-to-notifications-copy.md task 1): the /favorites
// route's in-page title and empty state must say "Notifications", matching the Stack.Screen
// title change in _layout.tsx -- otherwise the nav bar and the page body would disagree.
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import FavoritesScreen from "./favorites";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";

jest.mock("../lib/favoritesStorage", () => {
  const getFavorites = jest.fn().mockResolvedValue([]);
  return { SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({ getFavorites })) };
});

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

const favoritesMock = new SqliteFavoritesStorage() as unknown as { getFavorites: jest.Mock };

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .join(" ");
}

beforeEach(() => {
  favoritesMock.getFavorites.mockReset().mockResolvedValue([]);
});

// FlatList schedules its own setTimeout(_updateCellsToRender) on mount; unmounting after each
// assertion cancels it so it can't fire (and log an act() warning) after the test body returns.
async function renderAndTeardown(): Promise<string> {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<FavoritesScreen />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  const body = texts(root);
  act(() => {
    root.unmount();
  });
  return body;
}

describe("FavoritesScreen copy", () => {
  it("titles the page 'Notifications', not 'Favorites'", async () => {
    const body = await renderAndTeardown();
    expect(body).toMatch(/Notifications/);
    expect(body).not.toMatch(/Favorites/);
  });

  it("shows a 'No notifications yet' empty state, not 'No favorites yet'", async () => {
    const body = await renderAndTeardown();
    expect(body).toMatch(/No notifications yet/);
    expect(body).not.toMatch(/No favorites yet/);
  });
});
