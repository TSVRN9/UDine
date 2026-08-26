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
jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [mockCameraPermission, mockRequestPermission],
}));

jest.mock("expo-linking", () => ({ openSettings: jest.fn() }));

// The real screen's useFocusEffect callback sets up two real setInterval timers (5-min remint,
// 3s poll) and returns a cleanup that clears them -- unlike addFriendsScreen.test.tsx/
// qrConfirmScreen.test.tsx's identical-looking mock, this one can't just discard that cleanup, or
// the timers outlive the test and Jest hangs waiting for the event loop to go idle. Captured here
// and invoked explicitly at the end of the test instead.
const mockSeenFocusCallbacks = new WeakSet<() => void>();
let focusCleanup: (() => void) | void;
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn().mockReturnValue(true), replace: jest.fn(), push: jest.fn() },
  useFocusEffect: (callback: () => (() => void) | void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    focusCleanup = callback();
  },
}));

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
const mockRpc = jest.fn().mockResolvedValue({ data: { token: "11111111-1111-1111-1111-111111111111" }, error: null });
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
  focusCleanup = undefined;
  mockCameraPermission = { granted: false };
  mockRpc.mockResolvedValue({ data: { token: "11111111-1111-1111-1111-111111111111" }, error: null });
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
    focusCleanup?.();
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
