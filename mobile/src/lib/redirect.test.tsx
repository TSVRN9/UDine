// Lives here, not next to src/app/redirect.tsx: expo-router scans every file under src/app/ as a
// candidate route (confirmed on-device -- a .test.tsx there gets bundled into the real app and
// crashes at runtime on the bare `jest` global). No other route file has a colocated test for the
// same reason; this one imports the screen by relative path instead.
jest.mock("./auth", () => ({
  exchangeCode: jest.fn(),
  isSignInInFlight: jest.fn(() => false),
  shouldExchangeCode: jest.fn((code: unknown, inFlight: boolean) => typeof code === "string" && !inFlight),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(),
  Redirect: jest.fn(() => null),
}));

import { Alert } from "react-native";
import renderer, { act } from "react-test-renderer";
import * as expoRouter from "expo-router";
import RedirectScreen from "../app/redirect";
import * as auth from "./auth";

const mockedAuth = auth as jest.Mocked<typeof auth>;
const mockedUseLocalSearchParams = expoRouter.useLocalSearchParams as jest.Mock;
const mockedRedirect = expoRouter.Redirect as jest.Mock;

// #54's own complaint was a cold-start failure landing the user silently signed out. A
// console.error-only catch repeats that with a visible toast instead of a screen -- invisible in
// a release build. This checks the fix reuses index.tsx's Alert.alert, which is native and
// survives this screen's immediate <Redirect> unmount.
describe("RedirectScreen cold-start exchange failure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("surfaces a failed cold-start exchange via Alert.alert", async () => {
    mockedUseLocalSearchParams.mockReturnValue({ code: "bad-code" });
    mockedAuth.exchangeCode.mockRejectedValue(new Error("invalid flow state"));

    await act(async () => {
      renderer.create(<RedirectScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith("Sign-in failed", "invalid flow state");
  });
});

// #258: pins the warm-path guard wiring -- this screen must feed the *real* isSignInInFlight()
// result into shouldExchangeCode, not a hardcoded/omitted value. If that wiring is ever dropped
// (e.g. shouldExchangeCode(code) or shouldExchangeCode(code, false)), the warm path would
// double-exchange the single-use PKCE code that signInWithGoogle() is already mid-exchange on.
describe("RedirectScreen warm-path guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not exchange the code itself when isSignInInFlight() reports the warm path already is", async () => {
    mockedUseLocalSearchParams.mockReturnValue({ code: "some-code" });
    mockedAuth.isSignInInFlight.mockReturnValue(true);

    await act(async () => {
      renderer.create(<RedirectScreen />);
      await Promise.resolve();
    });

    expect(mockedAuth.isSignInInFlight).toHaveBeenCalled();
    expect(mockedAuth.shouldExchangeCode).toHaveBeenCalledWith("some-code", true);
    expect(mockedAuth.exchangeCode).not.toHaveBeenCalled();
  });

  // #280 regression: this screen's <Redirect> must still fire immediately on the warm path -- the
  // gating added for the cold-start race (below) must not introduce a spurious wait when there's
  // nothing to await (shouldExchangeCode already said no exchange is needed here).
  it("still redirects immediately when the guard skips the exchange", async () => {
    mockedUseLocalSearchParams.mockReturnValue({ code: "some-code" });
    mockedAuth.isSignInInFlight.mockReturnValue(true);

    await act(async () => {
      renderer.create(<RedirectScreen />);
      await Promise.resolve();
    });

    expect(mockedRedirect.mock.calls[0]?.[0]).toEqual({ href: "/" });
  });
});

// #280: index.tsx mounts the instant this screen's <Redirect> fires, and on a first-ever sign-in
// its getSession() check races the still-in-flight PKCE exchange -- landing before the exchange
// settles is exactly what produces the spurious /login push (see index.tsx's own doc comment on
// PaneShellScreen). Gating the <Redirect> on the exchange settling closes that race at its source.
describe("RedirectScreen cold-start exchange gating", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    // A prior test's isSignInInFlight.mockReturnValue(true) survives jest.clearAllMocks() --
    // it only clears call history, not configured return values -- so this must be reasserted
    // explicitly rather than relying on the module factory's default.
    mockedAuth.isSignInInFlight.mockReturnValue(false);
  });

  it("does not redirect until an in-flight cold-start exchange settles", async () => {
    mockedUseLocalSearchParams.mockReturnValue({ code: "some-code" });
    let resolveExchange: () => void = () => {};
    mockedAuth.exchangeCode.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveExchange = resolve;
      }),
    );

    await act(async () => {
      renderer.create(<RedirectScreen />);
      await Promise.resolve();
    });

    expect(mockedRedirect).not.toHaveBeenCalled();

    await act(async () => {
      resolveExchange();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedRedirect.mock.calls[0]?.[0]).toEqual({ href: "/" });
  });

  it("still redirects after a failed cold-start exchange instead of hanging on the spinner forever", async () => {
    mockedUseLocalSearchParams.mockReturnValue({ code: "bad-code" });
    mockedAuth.exchangeCode.mockRejectedValue(new Error("invalid flow state"));

    await act(async () => {
      renderer.create(<RedirectScreen />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith("Sign-in failed", "invalid flow state");
    expect(mockedRedirect.mock.calls[0]?.[0]).toEqual({ href: "/" });
  });
});
