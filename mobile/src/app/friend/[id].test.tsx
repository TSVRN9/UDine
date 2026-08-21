import type { ReactNode } from "react";

// PR #126 review findings #2/#4/#5 all slipped through because this screen had zero render
// coverage -- only pure helpers and pane-level wiring were tested anywhere in this app. These are
// the first render tests for a screen under mobile/src/app/.

const mockRouterBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: (...args: unknown[]) => mockRouterBack(...args) },
  useLocalSearchParams: () => ({ id: "friend-1" }),
  useFocusEffect: (callback: () => void) => callback(),
}));

/** Chainable query-builder stub that actually applies `.eq()` filters against the given rows
 * (rather than ignoring them and returning whatever was pre-baked) -- the whole point of these
 * tests is proving the *query itself* asks for status = 'accepted', not just that the component
 * renders correctly given already-filtered data. `.insert()` is separately controllable per test
 * via `opts.insertError`. */
function table(rows: Record<string, unknown>[], opts: { insertError?: unknown } = {}) {
  let filtered = rows;
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (col: string, val: unknown) => {
    filtered = filtered.filter((r) => r[col] === val);
    return builder;
  };
  builder.maybeSingle = () => Promise.resolve({ data: filtered[0] ?? null, error: null });
  builder.insert = jest.fn().mockResolvedValue({ data: null, error: opts.insertError ?? null });
  builder.then = (resolve: (v: { data: unknown[] }) => void) => resolve({ data: filtered });
  return builder;
}

const mockFrom = jest.fn();
jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import renderer, { act } from "react-test-renderer";
import { Alert, Text } from "react-native";
import { supabase } from "../../lib/supabase";
import FriendProfileScreen from "./[id]";

function session(userId: string) {
  return { data: { session: { user: { id: userId, email: `${userId}@umass.edu` } } } };
}

/** A Text node's own rendered string -- `<Text>Ping {name}</Text>` compiles to a two-element
 * children array (`["Ping ", "Casey"]`), which plain `String(children)` comma-joins into
 * "Ping ,Casey" instead of "Ping Casey". Every text-matching helper below goes through this. */
function ownText(n: renderer.ReactTestInstance): string {
  return Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children);
}

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map(ownText).join(" | ");
}

/** Finds the Pressable that owns the ping button, by walking up from the Text node whose own
 * rendered string starts with "Ping ". */
function findPingButton(root: renderer.ReactTestRenderer) {
  const pingText = root.root.findAllByType(Text).find((n) => ownText(n).startsWith("Ping "));
  if (!pingText) throw new Error("ping button text not found");
  let node = pingText.parent;
  while (node && typeof node.props.onPress !== "function") node = node.parent;
  if (!node) throw new Error("no onPress ancestor found for the ping button text");
  return node;
}

/** Sets up mockFrom for a given fixture: `friendship` is the raw row set friend/[id].tsx's query
 * would see BEFORE any `.eq()` filtering -- pending rows included, so a query that forgets the
 * status filter renders "Friends since" and a query that includes it doesn't. */
function mockTables(opts: {
  profile?: Record<string, unknown> | null;
  friendshipRows?: Record<string, unknown>[];
  sharedStats?: Record<string, unknown> | null;
  insertError?: unknown;
}) {
  // `.eq("user_id", id)` in the real query needs a matching key to survive `table()`'s filter --
  // the fixture only spells out the three stat columns, so inject it here rather than in every
  // call site. Built ONCE, outside mockFrom's implementation closure: this app's `useFocusEffect`
  // mock (below) fires on every render, and refresh()'s setState calls only stop retriggering a
  // render once React's Object.is bailout sees the same reference back -- a `{ ...opts.sharedStats }`
  // spread built fresh on every `mockFrom("shared_stats")` call defeats that and spins until Jest's
  // test timeout (same hazard SocialPane.test.tsx's own mock comment calls out).
  const sharedStatsRow = opts.sharedStats ? { user_id: "friend-1", ...opts.sharedStats } : null;

  mockFrom.mockImplementation((name: string) => {
    if (name === "profiles") return table(opts.profile ? [opts.profile] : []);
    if (name === "friendships") return table(opts.friendshipRows ?? []);
    if (name === "shared_stats") return table(sharedStatsRow ? [sharedStatsRow] : []);
    if (name === "pings") return table([], { insertError: opts.insertError });
    throw new Error(`unexpected table ${name}`);
  });
}

async function renderScreen() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<FriendProfileScreen />);
  });
  // refresh() is a deeper chain than YouPane's (an extra leading `await getSession()` before the
  // Promise.all of three `.maybeSingle()` queries), so one `await Promise.resolve()` isn't always
  // enough to drain every microtask hop before the resulting setState calls land. Flush twice.
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return root;
}

// A full `jest.mock("react-native", ...)` fights jest-expo's own native-module registration
// (TurboModuleRegistry errors) -- spy on the real Alert.alert instead, same as every other
// react-native API this app doesn't otherwise stub.
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe("FriendProfileScreen", () => {
  // Review finding #4: the friendships query had no status filter, so a merely-pending request
  // rendered "Friends since <date>" as if it were an established fact.
  it("does not render 'Friends since' for a pending (not-yet-accepted) connection", async () => {
    mockTables({
      profile: { user_id: "friend-1", display_name: "Casey" },
      friendshipRows: [{ user_a: "friend-1", user_b: "me", created_at: "2026-03-15T12:00:00Z", status: "pending" }],
      sharedStats: null,
    });
    const root = await renderScreen();
    expect(texts(root)).not.toMatch(/Friends since/);
  });

  it("renders 'Friends since' for a genuinely accepted connection", async () => {
    mockTables({
      profile: { user_id: "friend-1", display_name: "Casey" },
      friendshipRows: [{ user_a: "friend-1", user_b: "me", created_at: "2026-03-15T12:00:00Z", status: "accepted" }],
      sharedStats: null,
    });
    const root = await renderScreen();
    expect(texts(root)).toMatch(/Friends since March 2026/);
  });

  // Review finding #5: an opted-in-but-empty top_foods (a real array, just nothing in it yet) must
  // not render the same "doesn't share this" note as a genuinely un-opted-in (null) field -- that
  // would misstate the friend's actual privacy choice.
  it("renders 'doesn't share this' when top_foods was never opted into (null)", async () => {
    mockTables({
      profile: { user_id: "friend-1", display_name: "Casey" },
      sharedStats: { completion: null, top_foods: null, hall_ranks: null },
    });
    const root = await renderScreen();
    expect(texts(root)).toMatch(/Casey doesn.t share this/);
  });

  it("does NOT render 'doesn't share this' for top_foods when opted in but empty", async () => {
    mockTables({
      profile: { user_id: "friend-1", display_name: "Casey" },
      sharedStats: { completion: null, top_foods: [], hall_ranks: null },
    });
    const root = await renderScreen();
    // Two other sections (completion, hall_ranks) are genuinely un-shared and correctly say so --
    // this only asserts top_foods' own line isn't the same false claim.
    expect(texts(root)).toMatch(/Casey hasn.t rated enough foods yet/);
  });

  it("renders the actual top foods when opted in and non-empty", async () => {
    mockTables({
      profile: { user_id: "friend-1", display_name: "Casey" },
      sharedStats: { completion: null, top_foods: [{ dishName: "Pizza", score: 8.8, hallName: "Berkshire" }], hall_ranks: null },
    });
    const root = await renderScreen();
    expect(texts(root)).toMatch(/Pizza/);
    expect(texts(root)).not.toMatch(/Casey hasn.t rated enough foods yet/);
  });

  // Review finding #2: a discarded insert error used to alert a confirmed "Ping sent" regardless.
  it("alerts failure, not success, when the pings insert is rejected (e.g. RLS: not actually friends)", async () => {
    mockTables({ profile: { user_id: "friend-1", display_name: "Casey" }, insertError: { message: "row-level security policy violation" } });
    const root = await renderScreen();
    const button = findPingButton(root);
    await act(async () => {
      button.props.onPress();
    });
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't send ping", expect.any(String));
    expect(Alert.alert).not.toHaveBeenCalledWith("Ping sent", expect.anything());
  });

  it("alerts success when the pings insert succeeds", async () => {
    mockTables({ profile: { user_id: "friend-1", display_name: "Casey" } });
    const root = await renderScreen();
    const button = findPingButton(root);
    await act(async () => {
      button.props.onPress();
    });
    expect(Alert.alert).toHaveBeenCalledWith("Ping sent", expect.any(String));
  });
});
