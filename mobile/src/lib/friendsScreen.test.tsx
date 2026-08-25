// Lives here, not next to src/app/friends.tsx: expo-router scans every file under src/app/ as a
// candidate route (see redirect.test.tsx's own note) -- imports FriendsBody by relative path
// instead, same pattern as friendProfileScreen.test.tsx/redirect.test.tsx.

// friends.tsx's refresh() always builds a fresh `new Map(...)` for profilesById -- calling
// useFocusEffect's callback unconditionally on every render (friendProfileScreen.test.tsx's
// convention) never lets React's setState bail-out kick in and spins until Jest's test timeout.
// Same hazard, same fix as SocialPane.test.tsx's own mock: fire once per distinct callback
// identity (i.e. once per `[session]` dependency change).
const mockSeenFocusCallbacks = new WeakSet<() => void>();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    callback();
  },
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

/** Chainable query-builder stub. `.insert`/`.update` resolve to a configurable `{ error }`;
 * every other method is chain-through, resolving `.then()` to the fixed row set a test supplies
 * for that table -- same shape as friendProfileScreen.test.tsx's `table()`. */
function table(rows: Record<string, unknown>[], opts: { insertError?: unknown; updateError?: unknown } = {}) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.or = chain;
  builder.in = chain;
  builder.eq = chain;
  builder.order = chain;
  builder.ilike = chain;
  builder.neq = chain;
  builder.limit = chain;
  builder.insert = jest.fn().mockResolvedValue({ data: null, error: opts.insertError ?? null });
  builder.then = (resolve: (v: { data: unknown[] }) => void) => resolve({ data: rows });

  // .update(...).eq(...).eq(...) resolves separately from the plain select chain above -- it must
  // resolve `{ error }`, not `{ data: rows }`, or acceptFriend's own error check never sees it.
  const updateBuilder: Record<string, unknown> = {};
  updateBuilder.eq = () => updateBuilder;
  updateBuilder.then = (resolve: (v: { error: unknown }) => void) => resolve({ error: opts.updateError ?? null });
  builder.update = jest.fn().mockReturnValue(updateBuilder);

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
    channel: jest.fn().mockReturnValue({ on: jest.fn().mockReturnThis(), subscribe: jest.fn() }),
    removeChannel: jest.fn(),
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import renderer, { act } from "react-test-renderer";
import { Alert, Text, TextInput } from "react-native";
import { supabase } from "../lib/supabase";
import { FriendsBody } from "../app/friends";

function session(userId: string) {
  return { data: { session: { user: { id: userId, email: `${userId}@umass.edu` } } } };
}

function ownText(n: renderer.ReactTestInstance): string {
  return Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children);
}

/** Finds the Pressable/Text ancestor whose onPress fires, by walking up from a Text node matching `label`. */
function findPressableByText(root: renderer.ReactTestRenderer, label: string) {
  const textNode = root.root.findAllByType(Text).find((n) => ownText(n) === label);
  if (!textNode) throw new Error(`text "${label}" not found`);
  let node = textNode.parent;
  while (node && typeof node.props.onPress !== "function") node = node.parent;
  if (!node) throw new Error(`no onPress ancestor found for "${label}"`);
  return node;
}

function mockTables(opts: { friendshipRows?: Record<string, unknown>[]; profiles?: Record<string, unknown>[]; pingInsertError?: unknown; friendshipUpdateError?: unknown }) {
  mockFrom.mockImplementation((name: string) => {
    if (name === "friendships") return table(opts.friendshipRows ?? [], { updateError: opts.friendshipUpdateError });
    if (name === "profiles") return table(opts.profiles ?? []);
    if (name === "pings") return table([], { insertError: opts.pingInsertError });
    throw new Error(`unexpected table ${name}`);
  });
}

async function renderFriends() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<FriendsBody />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return root;
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: null });
  (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe("FriendsBody", () => {
  // Issue #146 (site 2): a discarded pings insert error used to leave the caller with no
  // indication the ping never sent, and it cleared the typed message as if it had.
  it("alerts failure and keeps the typed message when the pings insert is rejected", async () => {
    mockTables({
      friendshipRows: [{ user_a: "me", user_b: "friend-1", status: "accepted", requested_by: "me" }],
      profiles: [{ user_id: "friend-1", display_name: "Casey" }],
      pingInsertError: { message: "row-level security policy violation" },
    });
    const root = await renderFriends();

    const input = root.root.findAllByType(TextInput).find((n) => n.props.placeholder === "message (optional)")!;
    act(() => {
      input.props.onChangeText("come thru");
    });
    const pingButton = findPressableByText(root, 'Ping "come eat with me"');
    await act(async () => {
      pingButton.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith("Couldn't send ping", expect.any(String));
    const inputAfter = root.root.findAllByType(TextInput).find((n) => n.props.placeholder === "message (optional)")!;
    expect(inputAfter.props.value).toBe("come thru");
  });

  it("clears the typed message when the ping succeeds", async () => {
    mockTables({
      friendshipRows: [{ user_a: "me", user_b: "friend-1", status: "accepted", requested_by: "me" }],
      profiles: [{ user_id: "friend-1", display_name: "Casey" }],
    });
    const root = await renderFriends();

    const input = root.root.findAllByType(TextInput).find((n) => n.props.placeholder === "message (optional)")!;
    act(() => {
      input.props.onChangeText("come thru");
    });
    const pingButton = findPressableByText(root, 'Ping "come eat with me"');
    await act(async () => {
      pingButton.props.onPress();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    const inputAfter = root.root.findAllByType(TextInput).find((n) => n.props.placeholder === "message (optional)")!;
    expect(inputAfter.props.value).toBe("");
  });

  // requestFriend/acceptFriend "share the shape" per #146's own body -- same discarded-{error} bug.
  it("alerts failure when the accept-friend-request update is rejected", async () => {
    mockTables({
      friendshipRows: [{ user_a: "friend-1", user_b: "me", status: "pending", requested_by: "friend-1" }],
      profiles: [{ user_id: "friend-1", display_name: "Casey" }],
      friendshipUpdateError: { message: "row-level security policy violation" },
    });
    const root = await renderFriends();

    const acceptButton = findPressableByText(root, "Accept");
    await act(async () => {
      acceptButton.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith("Couldn't accept friend request", expect.any(String));
  });

  it("alerts failure and keeps the search results when the request_friendship rpc is rejected", async () => {
    mockTables({
      friendshipRows: [],
      profiles: [{ user_id: "stranger-1", display_name: "Sam" }],
    });
    mockRpc.mockResolvedValue({ data: null, error: { message: "row-level security policy violation" } });
    const root = await renderFriends();

    const searchInput = root.root.findAllByType(TextInput).find((n) => n.props.placeholder === "Search by name")!;
    await act(async () => {
      searchInput.props.onChangeText("Sam");
    });

    const addButton = findPressableByText(root, "Add friend");
    await act(async () => {
      addButton.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith("Couldn't send friend request", expect.any(String));
    // Search results are only cleared on success -- still there to retry/confirm the failure.
    expect(root.root.findAllByType(Text).some((n) => ownText(n) === "Sam")).toBe(true);
  });

  // Issue #252: a qr-origin pending row's raw `update({status:'accepted'})` passes RLS but always
  // hits the friendships_qr_needs_both_confirms CHECK constraint -- "Please try again" forever, no
  // retry helps. The code-owner side (requested_by !== myId) must not offer that dead-end Accept;
  // it must route to the CHECK-respecting /qr-confirm -> confirm_friendship path instead.
  it("routes a qr-origin pending row to qr-confirm instead of offering a raw Accept", async () => {
    mockTables({
      friendshipRows: [{ user_a: "friend-1", user_b: "me", status: "pending", requested_by: "friend-1", origin: "qr" }],
      profiles: [{ user_id: "friend-1", display_name: "Casey" }],
    });
    const root = await renderFriends();

    expect(() => findPressableByText(root, "Accept")).toThrow();
    const confirmButton = findPressableByText(root, "Confirm");
    await act(async () => {
      confirmButton.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith("/qr-confirm?userId=friend-1");
  });

  // The scanner's own side of that same stalled handshake (requested_by === myId) used to render
  // an inert "pending" label with no action at all -- also stranded if they backgrounded the app
  // before confirming (#239's owner-poll fix doesn't cover this list). Same route gets them back in.
  it("also routes the requester's own side of a qr-origin pending row to qr-confirm, not an inert pending label", async () => {
    mockTables({
      friendshipRows: [{ user_a: "me", user_b: "friend-1", status: "pending", requested_by: "me", origin: "qr" }],
      profiles: [{ user_id: "friend-1", display_name: "Casey" }],
    });
    const root = await renderFriends();

    const confirmButton = findPressableByText(root, "Confirm");
    await act(async () => {
      confirmButton.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith("/qr-confirm?userId=friend-1");
  });

  // Negative: search-origin pending rows are untouched by the CHECK constraint (confirmed_a/b stay
  // null for them) -- the existing single-side raw Accept must keep working for these.
  it("still shows a working raw Accept for search-origin pending rows", async () => {
    mockTables({
      friendshipRows: [{ user_a: "friend-1", user_b: "me", status: "pending", requested_by: "friend-1", origin: "search" }],
      profiles: [{ user_id: "friend-1", display_name: "Casey" }],
    });
    const root = await renderFriends();

    const acceptButton = findPressableByText(root, "Accept");
    await act(async () => {
      acceptButton.props.onPress();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
