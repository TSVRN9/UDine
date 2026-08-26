// #278: PaneShellScreen (index.tsx's default export) used to push /login purely off the
// device-local first-run flag -- on the #54 cold-start OAuth path (redirect.tsx's <Redirect
// href="/" /> lands here with the flag still undismissed, since dismissFirstRun() only ever runs
// inside login.tsx's done(), which that path never reaches), a user who just finished signing in
// got shoved right back onto the login screen. PaneStack is mocked to a no-op here -- this test is
// about the effect's push decision, not the pane tree, and mocking it out means SocialPane/
// HomePane/YouPane's own dependencies never need to be pulled in (JSX for the `panes` prop builds
// element descriptors either way, but React never mounts/calls them unless something renders those
// children).
jest.mock("../components/PaneStack", () => ({ PaneStack: () => null }));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// #245 item 8: PaneShellScreen (index.tsx) now imports CafeSheet's own CafePdfViewer chain, which
// pulls in react-native-webview -- no native module for it under jest (same fix as
// cafeScreen.test.tsx).
jest.mock("react-native-webview", () => ({ WebView: () => null }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
  Link: ({ children }: { children: unknown }) => children,
  useFocusEffect: (_callback: () => void) => {},
}));

const mockIsFirstRunDismissed = jest.fn();
jest.mock("../lib/firstRun", () => ({
  isFirstRunDismissed: () => mockIsFirstRunDismissed(),
  dismissFirstRun: jest.fn(),
}));

const mockGetSession = jest.fn();
jest.mock("../lib/supabase", () => ({
  supabase: { auth: { getSession: () => mockGetSession() } },
}));

// SocialPane/YouPane both import ../lib/auth, whose real module calls
// WebBrowser.maybeCompleteAuthSession() at import time and pulls in the real ./supabase (env-var
// dependent) -- same reason homePane.test.tsx/homePaneOffline.test.tsx stub this out wholesale
// rather than letting it load for real, even though nothing here ever calls signInWithGoogle.
jest.mock("../lib/auth", () => ({ signInWithGoogle: jest.fn(), signOut: jest.fn() }));

import renderer, { act } from "react-test-renderer";
import PaneShellScreen from "../app/index";

beforeEach(() => {
  mockPush.mockClear();
  mockIsFirstRunDismissed.mockReset();
  mockGetSession.mockReset();
});

describe("PaneShellScreen first-run gate (#278)", () => {
  it("pushes /login when first-run is undismissed and there's no session (the ordinary first-launch path)", async () => {
    mockIsFirstRunDismissed.mockResolvedValue(false);
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await act(async () => {
      renderer.create(<PaneShellScreen />);
    });

    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  // The red case: this fails on main, which pushes /login purely off the first-run flag with no
  // session check at all.
  it("does NOT push /login when a session already exists, even with first-run still undismissed (#54 cold-start OAuth)", async () => {
    mockIsFirstRunDismissed.mockResolvedValue(false);
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });

    await act(async () => {
      renderer.create(<PaneShellScreen />);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not push /login once first-run is dismissed, session or not", async () => {
    mockIsFirstRunDismissed.mockResolvedValue(true);
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await act(async () => {
      renderer.create(<PaneShellScreen />);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});
