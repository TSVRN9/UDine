// Lives here, not next to src/app/add-friend-qr.tsx -- same convention as addFriendsScreen.test.tsx
// / qrConfirmScreen.test.tsx (expo-router scans every file under src/app/ as a candidate route).

// #260: MyCodeTab used to derive its own display name from session.user.user_metadata.display_name
// (never actually populated -- profiles.display_name lives in public.profiles, not auth.users'
// metadata) falling back to session.user.email?.split("@")[0] -- the exact email-local-part guess
// handle_new_user itself no longer makes server-side. This test proves the screen now reads the
// real profiles.display_name instead: revert the component's supabase.from("profiles") fetch back
// to the old fallback chain and this goes red (renders "dave" instead of "Dave Chen").
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// #278: canAskAgain configurable per test (default true, matches the previous hardcoded shape) --
// the ScanTab "ALLOW CAMERA"/"OPEN SETTINGS" test overrides it to prove the dead-button fix.
let mockCameraPermission: { granted: boolean; canAskAgain?: boolean } = { granted: false };
const mockRequestPermission = jest.fn();
// #239 (B): captures onBarcodeScanned so a test can simulate the camera firing repeatedly while
// a code stays in frame -- the real bug this needs to reach.
let capturedOnBarcodeScanned: ((result: { data: string }) => void) | undefined;
jest.mock("expo-camera", () => ({
  CameraView: (props: { onBarcodeScanned?: (result: { data: string }) => void }) => {
    capturedOnBarcodeScanned = props.onBarcodeScanned;
    return null;
  },
  useCameraPermissions: () => [mockCameraPermission, mockRequestPermission],
}));

jest.mock("expo-linking", () => ({ openSettings: jest.fn() }));

// The real screen's useFocusEffect callbacks set up real setInterval timers (MyCodeTab's 5-min
// remint + 3s poll) and/or a cleanup that matters (ScanTab's #239 focus-gated latch reset) --
// unlike addFriendsScreen.test.tsx/qrConfirmScreen.test.tsx's identical-looking mock, this one
// can't just discard cleanups, or the timers outlive the test and Jest hangs waiting for the
// event loop to go idle. Every registration is captured (both MyCodeTab's and ScanTab's -- only
// one is mounted at a time, since the screen swaps between them, but both get a turn across a
// test) so afterEach can run every cleanup, and so a test can simulate a blur+refocus cycle (qr-
// confirm pushed on top, then popped back to) by re-invoking a specific entry's callback by hand.
type FocusEntry = { callback: () => (() => void) | void; cleanup?: () => void };
const focusEntries: FocusEntry[] = [];
const mockSeenFocusCallbacks = new WeakSet<() => void>();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn().mockReturnValue(true), replace: jest.fn(), push: jest.fn() },
  useFocusEffect: (callback: () => (() => void) | void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    const entry: FocusEntry = { callback };
    entry.cleanup = callback() ?? undefined;
    focusEntries.push(entry);
  },
}));

/** Simulates leaving this screen (its focus-effect cleanup runs -- e.g. qr-confirm pushed on top)
 * and coming back to it (the effect runs again) -- for a screen the real useFocusEffect mock
 * above otherwise only ever runs once per callback identity. */
function refocus(entry: FocusEntry) {
  entry.cleanup?.();
  entry.cleanup = entry.callback() ?? undefined;
}

function table(rows: Record<string, unknown>[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = jest.fn(chain);
  builder.or = jest.fn(chain);
  builder.maybeSingle = jest.fn().mockResolvedValue({ data: rows[0] ?? null, error: null });
  builder.then = (resolve: (v: { data: unknown[] }) => void) => resolve({ data: rows });
  return builder;
}

const mockFrom = jest.fn();
const mockRpc = jest.fn();
function defaultRpcImpl(name: string) {
  if (name === "mint_qr_token") return Promise.resolve({ data: { token: "11111111-1111-1111-1111-111111111111" }, error: null });
  return Promise.resolve({ data: null, error: null });
}
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest
        .fn()
        .mockResolvedValue({ data: { session: { user: { id: "dave-1", email: "dave@umass.edu", user_metadata: {} } } } }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import AddFriendQrScreen from "../app/add-friend-qr";

function ownText(n: renderer.ReactTestInstance): string {
  return Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children);
}

async function renderScreen() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<AddFriendQrScreen />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

let root: renderer.ReactTestRenderer | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  focusEntries.length = 0;
  mockCameraPermission = { granted: false };
  capturedOnBarcodeScanned = undefined;
  mockRpc.mockImplementation(defaultRpcImpl);
  mockFrom.mockImplementation((name: string) => {
    if (name === "profiles") return table([{ user_id: "dave-1", display_name: "Dave Chen" }]);
    if (name === "friendships") return table([]);
    return table([]);
  });
});

/** Finds the (possibly duplicated across composite/host nodes) pressable with this accessibilityLabel. */
function pressableWithLabel(root: renderer.ReactTestRenderer, label: string) {
  const node = root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`no pressable with accessibilityLabel "${label}" found`);
  return node;
}

/** Taps the "Scan" segment to switch off the default "My code" tab. */
async function switchToScanTab(root: renderer.ReactTestRenderer) {
  const scanTab = pressableWithLabel(root, "Scan");
  await act(async () => {
    scanTab.props.onPress();
  });
}

// Runs unconditionally (assertion failure included) -- an assertion throwing mid-test must not
// skip this, or the real setInterval timers the screen sets up survive the test and hang Jest.
afterEach(async () => {
  await act(async () => {
    focusEntries.forEach((entry) => entry.cleanup?.());
    root?.unmount();
  });
  root = undefined;
});

describe("AddFriendQrScreen MyCodeTab", () => {
  it("renders the caller's real profiles.display_name, never an email-derived guess", async () => {
    root = await renderScreen();

    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(root.root.findAllByType(Text).some((n) => ownText(n) === "Dave Chen")).toBe(true);
    expect(root.root.findAllByType(Text).some((n) => ownText(n) === "dave")).toBe(false);
  });
});

// #278: once the OS stops prompting (canAskAgain false -- Android after a second denial),
// requestPermission() resolves denied immediately with no native dialog -- the "ALLOW CAMERA"
// button did nothing, forever, with no route to Settings.
describe("AddFriendQrScreen ScanTab permission button (#278)", () => {
  it("still asks via requestPermission and shows ALLOW CAMERA while the OS can still prompt", async () => {
    mockCameraPermission = { granted: false, canAskAgain: true };
    root = await renderScreen();
    await switchToScanTab(root);

    const button = pressableWithLabel(root, "Grant camera access");
    expect(button.findAllByType(Text).some((n) => ownText(n) === "ALLOW CAMERA")).toBe(true);

    await act(async () => {
      button.props.onPress();
    });
    expect(mockRequestPermission).toHaveBeenCalled();
    expect(Linking.openSettings).not.toHaveBeenCalled();
  });

  // Red case: on main this button is always wired to requestPermission and always reads "ALLOW
  // CAMERA", regardless of canAskAgain -- a silent dead end once Android stops prompting.
  it("opens Settings instead of a no-op requestPermission once canAskAgain is false", async () => {
    mockCameraPermission = { granted: false, canAskAgain: false };
    root = await renderScreen();
    await switchToScanTab(root);

    const button = pressableWithLabel(root, "Open Settings");
    expect(button.findAllByType(Text).some((n) => ownText(n) === "OPEN SETTINGS")).toBe(true);

    await act(async () => {
      button.props.onPress();
    });
    expect(Linking.openSettings).toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});

// #239 (B): the camera fires onBarcodeScanned continuously while a code stays in frame (see the
// screen's own alertOnce comment). processingRef used to reset in a `finally` that ran on success
// too, so a second frame after a successful redeem re-fired redeem_qr_token against the now-pending
// row while qr-confirm was already pushed on top.
describe("AddFriendQrScreen ScanTab success latch (#239)", () => {
  it("does not redeem a second time when the camera fires again after a successful scan", async () => {
    mockCameraPermission = { granted: true };
    mockRpc.mockImplementation((name: string) => {
      if (name === "redeem_qr_token") return Promise.resolve({ data: { user_a: "dave-1", user_b: "sam-1" }, error: null });
      return defaultRpcImpl(name);
    });
    root = await renderScreen();
    await switchToScanTab(root);

    const uuid = "22222222-2222-2222-2222-222222222222";
    await act(async () => {
      capturedOnBarcodeScanned?.({ data: uuid });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const redeemCallsAfterFirstScan = mockRpc.mock.calls.filter(([name]) => name === "redeem_qr_token").length;
    expect(redeemCallsAfterFirstScan).toBe(1);

    // camera keeps firing on the still-in-frame code
    await act(async () => {
      capturedOnBarcodeScanned?.({ data: uuid });
      await Promise.resolve();
    });

    const redeemCallsAfterSecondScan = mockRpc.mock.calls.filter(([name]) => name === "redeem_qr_token").length;
    expect(redeemCallsAfterSecondScan).toBe(1);
  });

  // A permanent latch (reset only by unmounting ScanTab, e.g. toggling MY CODE -> SCAN) would fix
  // the re-fire but reintroduce the #278 failure shape: qr-confirm gets pushed on top of this
  // screen (blurring it, not unmounting it -- see add-friend-qr.tsx's own comment), and CANCEL
  // (#236/#247) pops back to it live. Every scan after that would silently no-op forever. The
  // latch must reset on refocus, not just never reset.
  it("resets the latch on refocus, so scanning works again after returning from a cancelled qr-confirm", async () => {
    mockCameraPermission = { granted: true };
    mockRpc.mockImplementation((name: string) => {
      if (name === "redeem_qr_token") return Promise.resolve({ data: { user_a: "dave-1", user_b: "sam-1" }, error: null });
      return defaultRpcImpl(name);
    });
    root = await renderScreen();
    await switchToScanTab(root);
    const scanTabFocus = focusEntries[focusEntries.length - 1];

    const uuid = "33333333-3333-3333-3333-333333333333";
    await act(async () => {
      capturedOnBarcodeScanned?.({ data: uuid });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRpc.mock.calls.filter(([name]) => name === "redeem_qr_token").length).toBe(1);

    // qr-confirm pushed on top blurs this screen; CANCEL pops back to it -- refocus.
    await act(async () => {
      refocus(scanTabFocus);
    });

    await act(async () => {
      capturedOnBarcodeScanned?.({ data: uuid });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRpc.mock.calls.filter(([name]) => name === "redeem_qr_token").length).toBe(2);
  });
});

// #250: redeem_qr_token's on-conflict hand-back of an already-accepted friendship (any origin)
// signals it via already_friends -- the scanner must forward that to qr-confirm.tsx so it can
// render an honest "already friends" state instead of the doomed ADD/CANCEL flow.
describe("AddFriendQrScreen ScanTab already-friends signal (#250)", () => {
  it("forwards alreadyFriends=1 when redeem_qr_token hands back an already-accepted row", async () => {
    mockCameraPermission = { granted: true };
    mockRpc.mockImplementation((name: string) => {
      if (name === "redeem_qr_token") return Promise.resolve({ data: { user_a: "dave-1", user_b: "sam-1", already_friends: true }, error: null });
      return defaultRpcImpl(name);
    });
    root = await renderScreen();
    await switchToScanTab(root);

    await act(async () => {
      capturedOnBarcodeScanned?.({ data: "44444444-4444-4444-4444-444444444444" });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(router.push).toHaveBeenCalledWith(expect.stringContaining("alreadyFriends=1"));
  });

  it("forwards alreadyFriends=0 for a genuinely fresh in-person add", async () => {
    mockCameraPermission = { granted: true };
    mockRpc.mockImplementation((name: string) => {
      if (name === "redeem_qr_token") return Promise.resolve({ data: { user_a: "dave-1", user_b: "sam-1", already_friends: false }, error: null });
      return defaultRpcImpl(name);
    });
    root = await renderScreen();
    await switchToScanTab(root);

    await act(async () => {
      capturedOnBarcodeScanned?.({ data: "55555555-5555-5555-5555-555555555555" });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(router.push).toHaveBeenCalledWith(expect.stringContaining("alreadyFriends=0"));
  });
});

// #239 (C): mint_qr_token's RPC error used to be silently discarded, leaving the qr card blank
// with no indication anything went wrong -- a user could hold out a blank white card for up to
// 5 minutes. Surfaces the error with a retry instead.
describe("AddFriendQrScreen MyCodeTab mint failure (#239)", () => {
  it("shows an error and a retry affordance instead of a blank card when mint_qr_token fails", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "mint_qr_token") return Promise.resolve({ data: null, error: { message: "boom" } });
      return defaultRpcImpl(name);
    });
    root = await renderScreen();

    expect(() => pressableWithLabel(root!, "Try again")).not.toThrow();
    expect(root.root.findAllByType(Text).some((n) => ownText(n).toLowerCase().includes("couldn't"))).toBe(true);
  });

  it("retry re-mints and clears the error once it succeeds", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "mint_qr_token") return Promise.resolve({ data: null, error: { message: "boom" } });
      return defaultRpcImpl(name);
    });
    root = await renderScreen();
    const retryButton = pressableWithLabel(root, "Try again");

    mockRpc.mockImplementation(defaultRpcImpl);
    await act(async () => {
      retryButton.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(() => pressableWithLabel(root!, "Try again")).toThrow();
  });
});
