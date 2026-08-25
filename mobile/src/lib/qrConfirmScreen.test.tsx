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
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ userId: "dave-1" }),
  useFocusEffect: (callback: () => void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    callback();
  },
}));

const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
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

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    if (name === "related_profiles" && (args?.target_ids as string[])?.[0] === "dave-1") {
      return Promise.resolve({ data: [{ user_id: "dave-1", display_name: "Dave", email: "dave@umass.edu" }], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

describe("QrConfirmScreen", () => {
  it("loads the scanned user's profile via related_profiles and renders their name and email", async () => {
    const root = await renderScreen();

    expect(mockRpc).toHaveBeenCalledWith("related_profiles", { target_ids: ["dave-1"] });
    expect(root.root.findAllByType(Text).some((n) => ownText(n) === "Dave")).toBe(true);
    expect(root.root.findAllByType(Text).some((n) => ownText(n) === "dave@umass.edu")).toBe(true);
  });
});
