// Explicit factories, not bare automocks -- automock still imports the real module to derive its
// shape, and the real ../lib/supabase / ../lib/firstRun both drag in native bindings (AsyncStorage,
// the Supabase client's url/key validation) unavailable outside jest-expo's native harness.
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

jest.mock("../lib/firstRun", () => ({
  isFirstRunDismissed: jest.fn().mockResolvedValue(true),
  dismissFirstRun: jest.fn(),
}));

// HomePane reads safe-area insets; there's no SafeAreaProvider in this render tree (same fix as
// hallMenu.test.tsx).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// HomePane always renders Links (hall cards, quick links) -- stub them out flat since there's no
// navigator in this render tree.
jest.mock("expo-router", () => ({
  Link: require("./mockLink").mockLink,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
  useFocusEffect: (_callback: () => void) => {},
}));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { HomePane } from "../app/index";

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

describe("HomePane", () => {
  it("renders all four hall cards", async () => {
    // #179: the pane header (title/dots) moved out of each pane into the shared fixed header
    // (PaneStack + PaneHeader) -- HomePane no longer renders its own "UDine" title text or takes
    // an activeIndex prop.
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });

    const body = texts(root).flat().join(" ");
    for (const hall of ["Worcester", "Franklin", "Hampshire", "Berkshire"]) {
      expect(body).toMatch(new RegExp(hall));
    }
  });

  it("gives every hall's split card an integrated Grab 'N Go strip (#116)", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });

    const body = texts(root).flat().join(" ");
    // One strip label per hall -- confirms the strip is per-card, not a single shared element.
    expect(body.match(/GRAB 'N GO/g)?.length).toBe(4);
  });
});
