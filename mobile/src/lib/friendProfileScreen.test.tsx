import type { ReactNode } from "react";

// PR #126 review findings #2/#4/#5 all slipped through because this screen had zero render
// coverage -- only pure helpers and pane-level wiring were tested anywhere in this app. These are
// the first render tests for a screen under mobile/src/app/.
//
// Lives here, not next to src/app/friend/[id].tsx: expo-router scans every file under src/app/ as
// a candidate route (see redirect.test.tsx's own note -- a .test.tsx there gets bundled into the
// real app and crashes at runtime on the bare `jest` global). Imports the screen by relative path
// instead, same pattern as redirect.test.tsx/hallMenu.test.tsx.

const mockRouterBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: (...args: unknown[]) => mockRouterBack(...args) },
  useLocalSearchParams: () => ({ id: "friend-1" }),
  useFocusEffect: (callback: () => void) => callback(),
}));

// #151: header ignored the top safe-area inset (no useSafeAreaInsets in the file at all, unlike
// every other headerless screen). A nonzero mocked inset, not 0, so the assertion below can't pass
// by accident on a header that just never reads insets in the first place.
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, right: 0, bottom: 0, left: 0 }),
}));

/** Chainable query-builder stub that actually applies `.eq()` filters against the given rows
 * (rather than ignoring them and returning whatever was pre-baked) -- the whole point of these
 * tests is proving the *query itself* asks for status = 'accepted', not just that the component
 * renders correctly given already-filtered data. No `.insert()` stub: the only insert this screen
 * used to do directly (`pings`) now goes through the mocked sendOrQueuePing above -- see the #294
 * comment on that mock. */
function table(rows: Record<string, unknown>[]) {
  let filtered = rows;
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (col: string, val: unknown) => {
    filtered = filtered.filter((r) => r[col] === val);
    return builder;
  };
  builder.maybeSingle = () => Promise.resolve({ data: filtered[0] ?? null, error: null });
  builder.then = (resolve: (v: { data: unknown[] }) => void) => resolve({ data: filtered });
  return builder;
}

const mockFrom = jest.fn();
jest.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// #294: friend/[id].tsx's ping send now routes through pingQueue.ts's sendOrQueuePing (same fix
// as friends.tsx/#231) instead of a raw supabase.from("pings").insert -- so ping-send behavior is
// driven by mocking that outcome, not a "pings" table insert stub. sendOrQueuePing itself touches
// real SQLite on a transient failure (via ./db -> expo-sqlite), which can't run under jest (see
// pingQueue.test.ts's own comment on the confirmed "NativeDatabase is not a constructor" error) --
// mocked flat here, same technique as friendsScreen.test.tsx/SocialPane.test.tsx.
const mockSendOrQueuePing = jest.fn().mockResolvedValue("sent");
jest.mock("./pingQueue", () => ({
  sendOrQueuePing: (...args: unknown[]) => mockSendOrQueuePing(...args),
}));

import renderer, { act } from "react-test-renderer";
import { Alert, StyleSheet, Text } from "react-native";
import { supabase } from "./supabase";
import { spacing } from "./theme";
import FriendProfileScreen from "../app/friend/[id]";

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
  mockSendOrQueuePing.mockResolvedValue("sent");
  (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe("FriendProfileScreen", () => {
  // #151: the maroon header (incl. the back chevron) sat partially under the status bar/notch --
  // every other headerless screen pads with insets.top + spacing(4.5), this one padded with a bare
  // spacing(4.5) and never read insets at all.
  it("pads the header top with the safe-area inset, not just the fixed spacing", async () => {
    mockTables({ profile: { user_id: "friend-1", display_name: "Casey" } });
    const root = await renderScreen();
    const backButton = root.root.findByProps({ accessibilityLabel: "Back" });
    const header = backButton.parent;
    if (!header) throw new Error("back button has no parent header view");
    const flatStyle = StyleSheet.flatten(header.props.style) as { paddingTop?: number };
    expect(flatStyle.paddingTop).toBe(44 + spacing(4.5));
  });

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

  // #271: shared_stats' check constraints only guarantee SQL NULL or a JSON array -- an accepted
  // friend can still write any other shape via a raw PostgREST upsert (owner RLS allows it), and
  // the screen used to do `stats.completion.map(...)` / `stats.hall_ranks.map(...)` with no
  // Array.isArray guard. A malformed non-array field must degrade to the same "doesn't share
  // this" state as an absent field, not throw and take the screen down.
  it("renders 'doesn't share this' instead of throwing when completion/hall_ranks are malformed non-array shapes", async () => {
    mockTables({
      profile: { user_id: "friend-1", display_name: "Casey" },
      sharedStats: { completion: "boom", top_foods: { x: 1 }, hall_ranks: 42 },
    });
    // Rendering itself must not throw -- pre-fix, this line throws "boom".map is not a function.
    const root = await renderScreen();
    // All three sections fall back to the honest "doesn't share this" state -- completion and
    // hall_ranks because a non-array is treated the same as absent; top_foods because an object
    // isn't an array either (it does NOT get the "opted in but empty" wording, which is reserved
    // for a genuine empty array).
    expect(texts(root).match(/Casey doesn.t share this/g)).toHaveLength(3);
  });

  // The server constraint can't see inside array elements -- a top_foods entry with a
  // non-numeric score still throws at `f.score.toFixed(1)` even though the OUTER shape is a
  // genuine array, so the Array.isArray guard alone isn't enough here.
  it("does not throw when a top_foods entry has a non-numeric score, and drops just that entry", async () => {
    mockTables({
      profile: { user_id: "friend-1", display_name: "Casey" },
      sharedStats: { completion: null, top_foods: [{ dishName: "x", score: "nope", hallName: null }], hall_ranks: null },
    });
    // Rendering itself must not throw -- pre-fix, this line throws "nope".toFixed is not a function.
    const root = await renderScreen();
    // Opted in (a real array), but the one entry it had was malformed and got filtered out --
    // same "opted in, nothing to show yet" wording as a genuinely empty array (review finding #5's
    // distinction), not "doesn't share this" and not a crash.
    expect(texts(root)).toMatch(/Casey hasn.t rated enough foods yet/);
    expect(texts(root)).not.toMatch(/nope/);
  });

  // #276 review: the outer Array.isArray guard plus a score-only entry filter still left FIVE
  // reachable crashes (same threat model -- an accepted friend, raw PostgREST upsert on their own
  // row): an object-valued dishName/hallName in top_foods, a null entry or an object-valued rank
  // in hall_ranks, and -- the issue's own named line -- a null entry in completion. All five drop
  // to the same "opted in, nothing to show" state instead of throwing.
  it("does not throw when top_foods entries have an object-valued dishName or hallName, and drops both", async () => {
    mockTables({
      profile: { user_id: "friend-1", display_name: "Casey" },
      sharedStats: {
        completion: null,
        top_foods: [
          { dishName: { evil: 1 }, score: 9 },
          { dishName: "ok", score: 9, hallName: { evil: 1 } },
        ],
        hall_ranks: null,
      },
    });
    // Pre-fix, this throws "Objects are not valid as a React child" for either entry.
    const root = await renderScreen();
    expect(texts(root)).toMatch(/Casey hasn.t rated enough foods yet/);
    expect(texts(root)).not.toMatch(/\bok\b/);
  });

  it("does not throw when hall_ranks has a null entry or an object-valued rank, and drops both", async () => {
    mockTables({
      profile: { user_id: "friend-1", display_name: "Casey" },
      sharedStats: { completion: null, top_foods: null, hall_ranks: [null, { hallTid: 1, rank: { evil: 1 } }] },
    });
    // Pre-fix: [null] throws "Cannot read properties of null (reading 'rank')"; the second entry
    // throws "Objects are not valid as a React child".
    const root = await renderScreen();
    expect(texts(root)).not.toMatch(/evil/);
  });

  it("does not throw when completion has a null entry, and drops it -- the issue's own named line", async () => {
    mockTables({
      profile: { user_id: "friend-1", display_name: "Casey" },
      sharedStats: { completion: [null], top_foods: null, hall_ranks: null },
    });
    // Pre-fix: throws "Cannot read properties of null (reading 'hallTid')" inside CompletionRow.
    await expect(renderScreen()).resolves.toBeDefined();
  });

  // Review finding #2: a discarded insert error used to alert a confirmed "Ping sent" regardless.
  // Now driven by sendOrQueuePing's "rejected" outcome (a genuine RLS rejection), not a raw insert.
  it("alerts failure, not success, when the ping is permanently rejected (e.g. RLS: not actually friends)", async () => {
    mockTables({ profile: { user_id: "friend-1", display_name: "Casey" } });
    mockSendOrQueuePing.mockResolvedValue("rejected");
    const root = await renderScreen();
    const button = findPingButton(root);
    await act(async () => {
      button.props.onPress();
    });
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't send ping", expect.any(String));
    expect(Alert.alert).not.toHaveBeenCalledWith("Ping sent", expect.anything());
  });

  it("alerts success when the ping actually sends", async () => {
    mockTables({ profile: { user_id: "friend-1", display_name: "Casey" } });
    mockSendOrQueuePing.mockResolvedValue("sent");
    const root = await renderScreen();
    const button = findPingButton(root);
    await act(async () => {
      button.props.onPress();
    });
    expect(Alert.alert).toHaveBeenCalledWith("Ping sent", expect.any(String));
  });

  // #294 (root-caused off #231/#215): this screen's ping send used to call
  // supabase.from("pings").insert directly and treat ANY error -- transient network failure
  // included -- as the same "not friends (yet)" rejection, discarding the ping with no queueing.
  // Now routed through sendOrQueuePing: a transient failure must queue (own honest copy), never
  // show the misleading rejection alert.
  it("#294: a transient (queued) failure shows honest 'queued' copy, not the misleading 'not friends' rejection alert", async () => {
    mockTables({ profile: { user_id: "friend-1", display_name: "Casey" } });
    mockSendOrQueuePing.mockResolvedValue("queued");
    const root = await renderScreen();
    const button = findPingButton(root);
    await act(async () => {
      button.props.onPress();
    });
    expect(Alert.alert).not.toHaveBeenCalledWith("Couldn't send ping", expect.anything());
    expect(Alert.alert).toHaveBeenCalledWith("Ping queued", expect.any(String));
  });
});
