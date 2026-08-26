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

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

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
  mockRpc.mockResolvedValue({ data: { token: "11111111-1111-1111-1111-111111111111" }, error: null });
  mockFrom.mockImplementation((name: string) => {
    if (name === "profiles") return table([{ user_id: "dave-1", display_name: "Dave Chen" }]);
    if (name === "friendships") return table([]);
    return table([]);
  });
});

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
