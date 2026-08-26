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
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn().mockReturnValue(true), dismissTo: jest.fn() },
}));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { router } from "expo-router";
import LoginScreen from "../app/login";
import { dismissFirstRun } from "../lib/firstRun";
import { signInWithGoogle } from "../lib/auth";

function body(root: renderer.ReactTestRenderer): string {
  return root.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .join(" ");
}

describe("LoginScreen", () => {
  // #278's two new cases below assert on dismissFirstRun/router call counts -- these mocks
  // otherwise carry calls over from whichever test ran first in this file.
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  // #245 item 7: dismissTo("/") replaces canGoBack() ? back() : replace("/") -- see login.tsx's
  // done() for why (redirect.tsx's warm-path <Redirect href="/" /> can land an extra index on top
  // of login, which a plain back() only pops one layer of).
  it("skip dismisses the first-run flag and clears login out of history via dismissTo('/')", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<LoginScreen />);
    });

    // Composite Pressable doesn't surface via findAllByType here -- match on the button role +
    // rendered text instead, taking the outermost (composite) node, which owns onPress.
    const skip = root.root.findAll(
      (n) =>
        n.props?.accessibilityRole === "button" &&
        typeof n.props?.onPress === "function" &&
        JSON.stringify(n.findAllByType(Text).map((t) => t.props.children)).includes("Skip"),
    )[0];
    expect(skip).toBeDefined();

    await act(async () => {
      await skip!.props.onPress();
    });

    expect(dismissFirstRun).toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledWith("/");
  });

  // #278 red case: on main, signInWithGoogle() returning undefined (cancel/dismiss) was
  // indistinguishable from a successful sign-in, so handleSignIn always called done() -- a user
  // who tapped "Continue with Google" and backed out got silently dropped into the anonymous app
  // with first-run permanently dismissed, the exact "Skip" outcome they didn't choose.
  it("cancelling the Google chooser does NOT dismiss first-run and leaves the user on this screen", async () => {
    (signInWithGoogle as jest.Mock).mockResolvedValue(false);

    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<LoginScreen />);
    });

    const googleButton = root.root.findAll(
      (n) =>
        n.props?.accessibilityRole === "button" &&
        typeof n.props?.onPress === "function" &&
        JSON.stringify(n.findAllByType(Text).map((t) => t.props.children)).includes("Continue with Google"),
    )[0];
    expect(googleButton).toBeDefined();

    await act(async () => {
      await googleButton!.props.onPress();
    });

    expect(signInWithGoogle).toHaveBeenCalled();
    expect(dismissFirstRun).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it("a successful Google sign-in does dismiss first-run and clears login out of history via dismissTo('/')", async () => {
    (signInWithGoogle as jest.Mock).mockResolvedValue(true);

    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<LoginScreen />);
    });

    const googleButton = root.root.findAll(
      (n) =>
        n.props?.accessibilityRole === "button" &&
        typeof n.props?.onPress === "function" &&
        JSON.stringify(n.findAllByType(Text).map((t) => t.props.children)).includes("Continue with Google"),
    )[0];

    await act(async () => {
      await googleButton!.props.onPress();
    });

    expect(dismissFirstRun).toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledWith("/");
  });
});
