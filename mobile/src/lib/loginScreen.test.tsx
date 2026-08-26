// #245 item 7: login.tsx used to pop with `canGoBack() ? back() : replace("/")`, which only
// removes ONE screen -- on the warm Google sign-in path, redirect.tsx's own `<Redirect href="/" />`
// lands an extra index on top of login (see redirect.tsx's doc comment), so a plain back() leaves
// login reachable below the main shell and hardware back resurfaces first-open. dismissTo("/")
// collapses everything down to the existing "/" (or replaces if none exists), so history always
// ends with exactly one "/" and nothing below it to go back to.
const mockDismissTo = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    dismissTo: (...args: unknown[]) => mockDismissTo(...args),
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: jest.fn().mockReturnValue(true),
  },
}));

const mockDismissFirstRun = jest.fn();
jest.mock("../lib/firstRun", () => ({
  dismissFirstRun: (...args: unknown[]) => mockDismissFirstRun(...args),
}));

jest.mock("../lib/auth", () => ({ signInWithGoogle: jest.fn() }));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import LoginScreen from "../app/login";

beforeEach(() => {
  mockDismissTo.mockClear();
  mockBack.mockClear();
  mockReplace.mockClear();
  mockDismissFirstRun.mockReset();
});

describe("LoginScreen done() (#245 item 7)", () => {
  it("Skip clears login out of history via dismissTo('/'), not back()/replace()", async () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<LoginScreen />);
    });

    // Pressable itself doesn't survive to a matchable host/composite type in this render tree
    // (RN's Pressable resolves to a bare host View, no distinct type to search by) -- find by the
    // onPress-bearing node whose subtree renders the Skip copy instead.
    const skipButton = root.root
      .findAll((n) => typeof n.props.onPress === "function")
      .find((p) => p.findAllByType(Text).some((t) => typeof t.props.children === "string" && t.props.children.includes("Skip")))!;

    await act(async () => {
      await skipButton.props.onPress();
    });

    expect(mockDismissFirstRun).toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith("/");
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
