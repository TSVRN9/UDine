// First-launch screen (#96). Carries the anonymous-first messaging obligations that used to live
// on FirstRunCard (#68/#104 review blocker 2): the value prop must state data residency, export,
// and exactly what signing in adds -- if this copy drifts, the privacy promise silently vanishes.
jest.mock("../lib/firstRun", () => ({
  isFirstRunDismissed: jest.fn().mockResolvedValue(false),
  dismissFirstRun: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/auth", () => ({
  signInWithGoogle: jest.fn(),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn().mockReturnValue(true) },
}));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { router } from "expo-router";
import LoginScreen from "../app/login";
import { dismissFirstRun } from "../lib/firstRun";

function body(root: renderer.ReactTestRenderer): string {
  return root.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .join(" ");
}

describe("LoginScreen", () => {
  it("states the anonymous-first value prop: residency, export, and what sign-in adds", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<LoginScreen />);
    });

    const text = body(root);
    expect(text).toMatch(/never leaves this phone/);
    expect(text).toMatch(/export/i);
    expect(text).toMatch(/friends/);
    expect(text).toMatch(/pings/);
    expect(text).toMatch(/cross-device favorites/);
    expect(text).toMatch(/dish alerts/);
    expect(text).toMatch(/Skip — use without an account/);
  });

  it("skip dismisses the first-run flag and pops back", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<LoginScreen />);
    });

    // Composite Pressable doesn't surface via findAllByType here — match on the button role +
    // rendered text instead, taking the outermost (composite) node, which owns onPress.
    const skip = root.root.findAll(
      (n) =>
        n.props?.accessibilityRole === "button" &&
        typeof n.props?.onPress === "function" &&
        JSON.stringify(n.findAllByType(Text).map((t) => t.props.children)).includes("Skip"),
    )[0];
    expect(skip).toBeDefined();

    await act(async () => {
      skip!.props.onPress();
    });

    expect(dismissFirstRun).toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });
});
