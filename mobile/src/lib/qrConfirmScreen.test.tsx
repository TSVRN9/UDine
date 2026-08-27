// Lives here, not next to src/app/qr-confirm.tsx -- same convention as addFriendsScreen.test.tsx
// (expo-router scans every file under src/app/ as a candidate route).

// #227: profiles.email is no longer table-wide SELECT-granted, so this screen's profile lookup
// (previously a raw .from("profiles").select("...email")) now goes through the related_profiles
// RPC -- a qr-origin friendship row always exists between the two parties by the time this screen
// loads (redeem_qr_token creates it), so the RPC's self-or-existing-relationship scope always
// covers the target here.
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// Guards against calling the same callback on every render (not just focus/mount, the way the real
// useFocusEffect does) -- same convention as addFriendsScreen.test.tsx. Without it, load()'s
// setProfile(newObjectEachCall) never gets a stable reference to bail out on, so a naive
// `useFocusEffect: (cb) => cb()` re-invokes forever and the test hangs to its timeout.
const mockSeenFocusCallbacks = new WeakSet<() => void>();
// #250: alreadyFriends is now a real route param (add-friend-qr.tsx forwards redeem_qr_token's
// already_friends signal) -- mutable so a test can simulate landing here via that hand-back path.
let mockSearchParams: { userId: string; alreadyFriends?: string } = { userId: "dave-1" };
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (callback: () => void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    callback();
  },
}));

const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
const mockGetSession = jest.fn();
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// #250 (round 2 hunt): the screen's ADD/CANCEL wiring itself -- whether it actually calls
// cancelQrFriendRequest with the right (client, myId, otherId) order and reads its {error} -- is
// pinned here, not by cancelQrFriendRequest's own unit tests (those only pin the helper in
// isolation, never that the screen still calls it). Mocked as a module so this test controls its
// resolved {error} without reimplementing the RLS-filtered-delete fake cancelQrFriendRequest.test.ts
// already owns.
const mockCancelQrFriendRequest = jest.fn().mockResolvedValue({ error: null });
jest.mock("../lib/cancelQrFriendRequest", () => ({
  cancelQrFriendRequest: (...args: unknown[]) => mockCancelQrFriendRequest(...args),
}));

import renderer, { act } from "react-test-renderer";
import { Alert, Text } from "react-native";
import QrConfirmScreen from "../app/qr-confirm";

function ownText(n: renderer.ReactTestInstance): string {
  return Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children);
}

async function renderScreen() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<QrConfirmScreen />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

function pressableWithLabel(root: renderer.ReactTestRenderer, label: string) {
  const node = root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`no pressable with accessibilityLabel "${label}" found`);
  return node;
}

function addButtonLabelFor(name: string) {
  return `ADD ${name.toUpperCase()}`;
}

const ME = "00000000-0000-0000-0000-000000000001";
const DAVE = "dave-1";

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = { userId: DAVE };
  mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    if (name === "related_profiles" && (args?.target_ids as string[])?.[0] === "dave-1") {
      return Promise.resolve({ data: [{ user_id: "dave-1", display_name: "Dave", email: "dave@umass.edu" }], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: ME } } } });
  mockCancelQrFriendRequest.mockResolvedValue({ error: null });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("QrConfirmScreen", () => {
  it("loads the scanned user's profile via related_profiles and renders their name and email", async () => {
    const root = await renderScreen();

    expect(mockRpc).toHaveBeenCalledWith("related_profiles", { target_ids: ["dave-1"] });
    expect(root.root.findAllByType(Text).some((n) => ownText(n) === "Dave")).toBe(true);
    expect(root.root.findAllByType(Text).some((n) => ownText(n) === "dave@umass.edu")).toBe(true);
  });

  // #250 (round 2 hunt, CONFIRMED-MEDIUM): nothing previously pinned that CANCEL actually calls
  // cancelQrFriendRequest -- a rebase reverting to the old unconditional delete would have passed
  // CI silently, exactly how #236 came back once already.
  it("pressing Cancel calls cancelQrFriendRequest(supabase, myId, otherId) then router.back()", async () => {
    const root = await renderScreen();
    const { router } = jest.requireMock("expo-router") as { router: { back: jest.Mock } };

    await act(async () => {
      pressableWithLabel(root, "Cancel").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCancelQrFriendRequest).toHaveBeenCalledWith(expect.anything(), ME, DAVE);
    expect(router.back).toHaveBeenCalled();
  });

  // #250 (item 3): cancelQrFriendRequest's helper now returns {error} -- qr-confirm.tsx used to
  // discard it, so a failed delete looked identical to a successful one. Same "surface {error},
  // don't proceed on failure" convention as friends.tsx's acceptFriend/requestFriend.
  it("surfaces a failed cancel via Alert instead of navigating back silently", async () => {
    mockCancelQrFriendRequest.mockResolvedValue({ error: { message: "boom" } });
    const root = await renderScreen();
    const { router } = jest.requireMock("expo-router") as { router: { back: jest.Mock } };

    await act(async () => {
      pressableWithLabel(root, "Cancel").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  // #250 (item 1): redeem_qr_token's already_friends signal, forwarded by add-friend-qr.tsx as a
  // route param, must render an honest "already friends" state -- not the doomed ADD (confirm_
  // friendship raises against this row) / silently-no-op CANCEL (cancelQrFriendRequest's own
  // status='pending'/origin='qr' scope never matches an already-accepted row) dead end #250 reports.
  it("renders an already-friends state instead of ADD/CANCEL when alreadyFriends=1", async () => {
    mockSearchParams = { userId: DAVE, alreadyFriends: "1" };
    const root = await renderScreen();

    expect(root.root.findAllByType(Text).some((n) => ownText(n).includes("already friends"))).toBe(true);
    expect(() => pressableWithLabel(root, addButtonLabelFor("Dave"))).toThrow();
    expect(() => pressableWithLabel(root, "Cancel")).toThrow();
    expect(() => pressableWithLabel(root, "OK")).not.toThrow();
  });
});
