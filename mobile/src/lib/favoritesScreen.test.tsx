// PR #488 review finding: the /favorites route ("Notifications" screen) shipped with no test --
// the first attempt crashed because expo-router's app/ directory is eagerly required as a whole
// (require.context-style), so a naive test file living inside app/ pulls in every other route.
// Same fix as logsScreen.test.tsx/filtersScreen.test.tsx: live in ../lib, import the screen
// component from ../app/favorites, and mock its SQLite-backed storage class the same way
// logsScreen.test.tsx mocks SqliteLogStorage (the jest.fn()s are created once inside the factory,
// so the same mock instance backs both the screen's own module-scope `new SqliteFavoritesStorage()`
// and the one instantiated below to get at those jest.fn()s).
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import type { Favorite } from "@udine/shared";
import FavoritesScreen from "../app/favorites";
import { SqliteFavoritesStorage } from "./favoritesStorage";

jest.mock("../lib/favoritesStorage", () => {
  const getFavorites = jest.fn().mockResolvedValue([]);
  return { SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({ getFavorites })) };
});

let mockFocusEffectFired = false;
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    if (!mockFocusEffectFired) {
      mockFocusEffectFired = true;
      callback();
    }
  },
}));

const storageMock = new SqliteFavoritesStorage() as unknown as { getFavorites: jest.Mock };

function texts(root: renderer.ReactTestRenderer): string[] {
  return root.root.findAllByType(Text).map((n) => n.props.children).flat();
}

async function renderScreen(): Promise<renderer.ReactTestRenderer> {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<FavoritesScreen />);
  });
  return root;
}

beforeEach(() => {
  storageMock.getFavorites.mockReset().mockResolvedValue([]);
  mockFocusEffectFired = false;
});

describe("FavoritesScreen (route title 'Notifications', PR #488)", () => {
  it("renders the 'Notifications' page title, not the old 'Favorites' copy", async () => {
    const root = await renderScreen();
    const body = texts(root);
    expect(body).toContain("Notifications");
    expect(body).not.toContain("Favorites");
  });

  it("renders real favorites, dish and hall alike", async () => {
    const favs: Favorite[] = [
      { type: "dish", dishName: "Chicken Parm" },
      { type: "location", hallTid: 1 }, // Worcester
    ];
    storageMock.getFavorites.mockResolvedValue(favs);
    const root = await renderScreen();
    const body = texts(root);
    expect(body).toContain("Chicken Parm");
    expect(body).toContain("Worcester");
  });

  it("shows 'No notifications yet' when there are no favorites", async () => {
    const root = await renderScreen();
    const body = texts(root);
    expect(body).toContain("No notifications yet");
    expect(body).not.toContain("No favorites yet");
  });
});
