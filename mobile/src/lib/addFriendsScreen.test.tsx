// Lives here, not next to src/app/add-friends.tsx -- same convention as friendsScreen.test.tsx
// (expo-router scans every file under src/app/ as a candidate route).

// AddFriendsScreen reads safe-area insets; there's no SafeAreaProvider in this render tree (same
// fix as homePane.test.tsx/logsScreen.test.tsx).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockSeenFocusCallbacks = new WeakSet<() => void>();
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    callback();
  },
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn().mockReturnValue(true), replace: jest.fn() },
}));

function table(rows: Record<string, unknown>[], opts: { updateError?: unknown } = {}) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.or = jest.fn(chain);
  builder.in = chain;
  builder.eq = jest.fn(chain);
  builder.ilike = jest.fn(chain);
  builder.neq = chain;
  builder.limit = chain;
  builder.maybeSingle = jest.fn().mockResolvedValue({ data: rows[0] ?? null, error: null });
  builder.then = (resolve: (v: { data: unknown[] }) => void) => resolve({ data: rows });

  const updateBuilder: Record<string, unknown> = {};
  updateBuilder.eq = jest.fn().mockReturnValue(updateBuilder);
  updateBuilder.then = (resolve: (v: { error: unknown }) => void) => resolve({ error: opts.updateError ?? null });
  builder.update = jest.fn().mockReturnValue(updateBuilder);
  builder.delete = jest.fn().mockReturnValue(updateBuilder);

  return builder;
}

const mockFrom = jest.fn();
const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import renderer, { act } from "react-test-renderer";
import { Text, TextInput } from "react-native";
import { supabase } from "../lib/supabase";
import AddFriendsScreen from "../app/add-friends";

function session(userId: string) {
  return { data: { session: { user: { id: userId, email: `${userId}@umass.edu` } } } };
}

function ownText(n: renderer.ReactTestInstance): string {
  return Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children);
}

function findPressableByLabel(root: renderer.ReactTestRenderer, label: string) {
  const node = root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`no pressable with accessibilityLabel "${label}" found`);
  return node;
}

function mockTables(opts: { profiles?: Record<string, unknown>[]; myProfile?: Record<string, unknown>; friendshipRows?: Record<string, unknown>[] }) {
  mockFrom.mockImplementation((name: string) => {
    if (name === "profiles") return table(opts.profiles ?? (opts.myProfile ? [opts.myProfile] : []));
    if (name === "friendships") return table(opts.friendshipRows ?? []);
    throw new Error(`unexpected table ${name}`);
  });
}

async function renderScreen() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<AddFriendsScreen />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: null });
  (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
  mockTables({ myProfile: { discoverable: true } });
});

describe("AddFriendsScreen", () => {
  it("searching and tapping ADD calls request_friendship for that user", async () => {
    mockTables({
      myProfile: { discoverable: true },
      profiles: [{ user_id: "sam-1", display_name: "Sam Casey", email: "sam@umass.edu" }],
    });
    const root = await renderScreen();

    const input = root.root.findAllByType(TextInput)[0];
    await act(async () => {
      input.props.onChangeText("sam");
      await Promise.resolve();
    });

    const addButton = findPressableByLabel(root, "ADD SAM");
    await act(async () => {
      addButton.props.onPress();
    });

    expect(mockRpc).toHaveBeenCalledWith("request_friendship", { target_user_id: "sam-1" });
  });

  it("shows REQUESTED instead of ADD once a friendships row already exists for the searched user", async () => {
    mockTables({
      myProfile: { discoverable: true },
      profiles: [{ user_id: "sam-1", display_name: "Sam Casey", email: "sam@umass.edu" }],
      friendshipRows: [{ user_a: "me", user_b: "sam-1", status: "pending", requested_by: "me", origin: "search", confirmed_a: null, confirmed_b: null }],
    });
    const root = await renderScreen();

    const input = root.root.findAllByType(TextInput)[0];
    await act(async () => {
      input.props.onChangeText("sam");
      await Promise.resolve();
    });

    expect(() => findPressableByLabel(root, "ADD SAM")).toThrow();
    const requestedText = root.root.findAllByType(Text).find((n) => ownText(n) === "✓ REQUESTED");
    expect(requestedText).toBeTruthy();
  });

  it("toggling Findable by search off updates profiles.discoverable", async () => {
    mockTables({ myProfile: { discoverable: true } });
    const root = await renderScreen();

    const toggle = findPressableByLabel(root, "Findable by search");
    await act(async () => {
      toggle.props.onPress();
    });

    // A fresh table() builder is returned per .from("profiles") call (there's more than one --
    // the initial refresh()'s own-profile fetch, then this toggle's update) -- check across all
    // of them rather than assuming which index is "the" one.
    const profilesBuilders = mockFrom.mock.results.filter((_, i) => mockFrom.mock.calls[i][0] === "profiles").map((r) => r.value);
    const anyUpdatedDiscoverableFalse = profilesBuilders.some((b) => (b.update as jest.Mock).mock.calls.some((call) => call[0]?.discoverable === false));
    expect(anyUpdatedDiscoverableFalse).toBe(true);
  });

  it("renders the count badge for incoming requests", async () => {
    mockTables({
      myProfile: { discoverable: true },
      friendshipRows: [{ user_a: "me", user_b: "casey-1", status: "pending", requested_by: "casey-1", origin: "search", confirmed_a: null, confirmed_b: null }],
      profiles: [{ user_id: "casey-1", display_name: "Casey", email: "casey@umass.edu" }],
    });
    const root = await renderScreen();

    const badge = root.root.findAllByType(Text).find((n) => ownText(n) === "1");
    expect(badge).toBeTruthy();
  });

  // PR #210 review: add-friends.tsx used to build `.or(`display_name.ilike.%${term}%,email.ilike.
  // ${term}%`)` from raw user input. PostgREST's .or() filter syntax treats `,`/`(`/`)` in the
  // interpolated value as filter-expression syntax (a comma opens a new OR arm), which both broke
  // an honest "Smith, John" search (silently split into unrelated arms) and let a crafted term
  // inject arbitrary filter arms. Fixed by using two plain .ilike() calls instead, which pass the
  // term as an ordinary parameter with no such parsing.
  it("search uses plain .ilike() calls, never .or(), so a comma in the term can't inject filter arms", async () => {
    mockTables({
      myProfile: { discoverable: true },
      profiles: [{ user_id: "smith-1", display_name: "Smith, John", email: "smithjohn@umass.edu" }],
    });
    const root = await renderScreen();

    const input = root.root.findAllByType(TextInput)[0];
    await act(async () => {
      input.props.onChangeText("Smith, John");
      await Promise.resolve();
    });

    const profilesBuilders = mockFrom.mock.results.filter((_, i) => mockFrom.mock.calls[i][0] === "profiles").map((r) => r.value);
    const ilikeCalls = profilesBuilders.flatMap((b) => (b.ilike as jest.Mock).mock.calls);
    const orCalls = profilesBuilders.flatMap((b) => (b.or as jest.Mock).mock.calls);

    // The raw term reaches .ilike() unescaped and unsplit -- safe by construction, not by
    // client-side sanitization -- and .or() is never used for search at all.
    expect(ilikeCalls).toContainEqual(["display_name", "%Smith, John%"]);
    expect(ilikeCalls).toContainEqual(["email", "Smith, John%"]);
    expect(orCalls.length).toBe(0);

    // The honest comma search actually surfaces the match -- not silently emptied by a
    // comma-triggered filter split.
    expect(root.root.findAllByType(Text).some((n) => ownText(n) === "Smith, John")).toBe(true);
  });

  // PR #210 review (BLOCKER): both entry points that used to reach /friends (SocialPane's + avatar,
  // YouPane's Friends row) now point here instead, but /friends is still the only screen that shows
  // received pings + its realtime inbox. Without a way back to it, receiving a ping has no screen.
  it("still links to /friends, so received pings stay reachable", async () => {
    mockTables({ myProfile: { discoverable: true } });
    const root = await renderScreen();

    // The expo-router mock above renders <Link asChild> children as-is (it doesn't clone in the
    // onPress navigation prop the real Link does), so this checks the entry point is rendered at
    // all rather than routing through findPressableByLabel's onPress requirement.
    expect(root.root.findAll((n) => n.props.accessibilityLabel === "Friends and pings you've received").length).toBeGreaterThan(0);
  });
});
