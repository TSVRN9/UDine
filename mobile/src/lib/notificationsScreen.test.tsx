// Lives here, not next to src/app/notifications.tsx: expo-router scans every file under
// src/app/ as a candidate route (see redirect.test.tsx's own note) -- imports NotificationsBody
// by relative path instead, same pattern as friendProfileScreen.test.tsx/privacyScreen.test.tsx.

const mockSyncFavoritedFoods = jest.fn().mockResolvedValue({ error: null });
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  syncFavoritedFoods: (...args: unknown[]) => mockSyncFavoritedFoods(...args),
}));

jest.mock("expo-constants", () => ({ expoConfig: { extra: { eas: { projectId: "test-project" } } } }));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: "ExponentPushToken[test]" }),
}));

jest.mock("../lib/favoritesStorage", () => ({
  SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({ getFavorites: jest.fn().mockResolvedValue([]) })),
}));

// Needed to import the REAL ../lib/auth (its signOut()) below -- #264 review round 4's race test
// exercises the actual sign-out path, not a stand-in for it. auth.ts calls
// WebBrowser.maybeCompleteAuthSession() at module load and imports expo-linking; neither is
// exercised by signOut() itself, so bare no-op mocks (same shape as auth.test.ts's own) are enough.
jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock("expo-linking", () => ({
  createURL: jest.fn(() => "udine://redirect"),
  parse: jest.fn(),
}));

/** `.select().eq().single()` reads the fixed `profile` row; `.update().eq()` resolves the
 * configurable `{ error }` a test wants for this run; `.select().eq().order()` (food_sightings)
 * resolves an empty list -- this screen's sighting feed isn't what's under test here. */
function profilesTable(profile: Record<string, unknown>, updateError: unknown) {
  const selectBuilder: Record<string, unknown> = {};
  selectBuilder.select = () => selectBuilder;
  selectBuilder.eq = () => selectBuilder;
  selectBuilder.single = () => Promise.resolve({ data: profile, error: null });

  const updateBuilder: Record<string, unknown> = {};
  updateBuilder.eq = () => updateBuilder;
  updateBuilder.then = (resolve: (v: { error: unknown }) => void) => resolve({ error: updateError });

  return {
    select: selectBuilder.select,
    update: jest.fn().mockReturnValue(updateBuilder),
  };
}

function emptyTable() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.upsert = jest.fn().mockResolvedValue({ data: null, error: null });
  builder.delete = jest.fn().mockReturnValue({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) });
  builder.then = (resolve: (v: { data: unknown[] }) => void) => resolve({ data: [] });
  return builder;
}

const mockFrom = jest.fn();
// #263: registration switched from a raw push_tokens upsert to the register_push_token RPC (a
// shared-device token now has to be evicted from any other owner server-side, which a plain
// upsert can no longer do once push_tokens has a unique(platform, token) constraint) -- a jest
// fake client with no `.rpc` at all would let toggleNotifications' catch-all swallow the
// resulting TypeError silently, so every existing assertion here would stay green with push
// registration completely broken. See the "actually calls register_push_token" test below.
const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      // #264 review round 4: auth.ts's real signOut() calls this -- needed now that one test below
      // drives the actual sign-out path instead of standing in for it.
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// emptyTable()'s `.then` resolves a fresh `{ data: [] }` on every call -- an unconditional
// "call every render" useFocusEffect mock (friendProfileScreen.test.tsx's convention) never lets
// React's setState bail-out kick in and spins until Jest's test timeout. Same hazard/fix as
// SocialPane.test.tsx/friendsScreen.test.tsx: fire once per distinct callback identity.
const mockSeenFocusCallbacks = new WeakSet<() => void>();
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    callback();
  },
}));

import renderer, { act } from "react-test-renderer";
import { Alert, Switch } from "react-native";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";
import { signOut } from "../lib/auth";
import { NotificationsBody } from "../app/notifications";

function session(userId: string) {
  return { data: { session: { user: { id: userId, email: `${userId}@umass.edu` } } } };
}

function mockTables(opts: { notificationsEnabled: boolean; updateError?: unknown }) {
  mockFrom.mockImplementation((name: string) => {
    if (name === "profiles") return profilesTable({ notifications_enabled: opts.notificationsEnabled }, opts.updateError ?? null);
    if (name === "food_sightings") return emptyTable();
    if (name === "push_tokens") return emptyTable();
    throw new Error(`unexpected table ${name}`);
  });
}

async function renderNotifications() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<NotificationsBody />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return root;
}

/** Drains extra microtask ticks beyond renderNotifications()'s own two -- the re-registration
 * chain (getPermissionsAsync -> getExpoPushTokenAsync -> push_tokens.upsert, each withTimeout-
 * wrapped) is deeper than the toggle() chain other tests in this file await directly, and nothing
 * here hands back a promise the test can await on its own (useFocusEffect's mock callback fires
 * refresh() fire-and-forget). Generously overshooting is cheap and harmless. */
async function flush(times = 10) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncFavoritedFoods.mockResolvedValue({ error: null });
  (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe("NotificationsBody", () => {
  // Issue #146 (site 3): toggleNotifications used to run setNotificationsEnabled(next) -- and
  // proceed to sync favorited_foods/push_tokens against the wrong server state -- even when
  // profiles.update returned { error }. The switch must stay at its last-known-good value and
  // the dependent sync must not run.
  it("keeps the switch off and skips the favorites sync when profiles.update is rejected", async () => {
    mockTables({ notificationsEnabled: false, updateError: { message: "row-level security policy violation" } });
    const root = await renderNotifications();

    const toggle = root.root.findByType(Switch);
    expect(toggle.props.value).toBe(false);

    await act(async () => {
      await toggle.props.onValueChange(true);
    });

    const toggleAfter = root.root.findByType(Switch);
    expect(toggleAfter.props.value).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't update notifications", expect.any(String));
    expect(mockSyncFavoritedFoods).not.toHaveBeenCalled();
  });

  it("flips the switch on and syncs favorites when profiles.update succeeds", async () => {
    mockTables({ notificationsEnabled: false });
    const root = await renderNotifications();

    const toggle = root.root.findByType(Switch);
    await act(async () => {
      await toggle.props.onValueChange(true);
    });

    const toggleAfter = root.root.findByType(Switch);
    expect(toggleAfter.props.value).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockSyncFavoritedFoods).toHaveBeenCalled();
  });

  // #264 review finding 1: signOut() (auth.ts) deletes this account's push_tokens row(s) but
  // deliberately leaves notifications_enabled=true -- pre-fix, that left the toggle showing ON
  // forever with no token behind it (dead alerts until the user manually toggled off and back on).
  // useFavoriteFoodAlerts's refresh() must re-register this device's token on its own, without a
  // prompt, whenever it finds notifications already enabled.
  it("notifications already enabled but this device has no push_tokens row (e.g. right after #257's sign-out cleanup): mounting the screen re-registers it via register_push_token without a permission prompt", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: true }, null);
      if (name === "food_sightings") return emptyTable();
      if (name === "push_tokens") return emptyTable();
      throw new Error(`unexpected table ${name}`);
    });

    await renderNotifications();
    await flush();

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    // #263: the self-heal goes through register_push_token now, not a raw push_tokens upsert --
    // same eviction reasoning as toggle()'s own registration.
    expect(mockRpc).toHaveBeenCalledWith("register_push_token", { p_platform: "expo", p_token: "ExponentPushToken[test]" });
  });

  // #264 review round 4: the self-heal test above proved the token gets re-registered, but its own
  // getExpoPushTokenAsync call is a real network round trip -- if the real signOut() ran while
  // that's still in flight without waiting for it, its delete could land BEFORE the self-heal's
  // upsert, resurrecting the row under the now-signed-out user (reviewer-reproduced against an
  // earlier "compensate after the fact" attempt at this fix -- the compensating delete itself ran
  // post-auth.signOut(), with no session, and 403'd). This drives the REAL signOut() (not a stand-in
  // for it), holds the self-heal's own token fetch open, and asserts signOut() doesn't touch
  // push_tokens until the self-heal has actually finished -- so the final ordering is always
  // upsert-then-delete-then-auth.signOut(), never the reverse.
  it("real signOut() waits for an in-flight self-heal to finish before its own delete, so the row ends up deleted, not resurrected", async () => {
    const calls: string[] = [];
    mockRpc.mockImplementation(() => {
      calls.push("register");
      return Promise.resolve({ data: null, error: null });
    });
    const deleteEq2 = jest.fn().mockImplementation(() => {
      calls.push("delete");
      return Promise.resolve({ data: null, error: null });
    });
    const deleteEq1 = jest.fn().mockReturnValue({ eq: deleteEq2 });
    const pushTokensDelete = jest.fn().mockReturnValue({ eq: deleteEq1 });
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: true }, null);
      if (name === "food_sightings") return emptyTable();
      if (name === "push_tokens") return { delete: pushTokensDelete };
      throw new Error(`unexpected table ${name}`);
    });
    (supabase.auth.signOut as jest.Mock).mockImplementation(() => {
      calls.push("auth.signOut");
      return Promise.resolve({ error: null });
    });

    let resolveToken!: (v: { data: string }) => void;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
    );

    await renderNotifications();
    await flush(5); // let the self-heal reach getExpoPushTokenAsync and start waiting on it

    // The real sign-out path, not bumpSignOutEpoch() or any other stand-in for it.
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const signOutPromise = signOut();

    // signOut() must be blocked waiting for the pending self-heal here -- its own delete must not
    // have fired yet, since the self-heal's token fetch is still unresolved.
    await flush(3);
    expect(pushTokensDelete).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();

    resolveToken({ data: "ExponentPushToken[test]" });
    await signOutPromise;
    await flush();

    // #263: the self-heal registers via register_push_token now, not a raw push_tokens upsert.
    expect(mockRpc).toHaveBeenCalledWith("register_push_token", { p_platform: "expo", p_token: "ExponentPushToken[test]" });
    expect(deleteEq1).toHaveBeenCalledWith("user_id", "me");
    expect(deleteEq2).toHaveBeenCalledWith("platform", "expo");
    // The self-heal's registration lands first (the session is still live -- signOut() hasn't
    // reached auth.signOut() yet), then signOut()'s own delete removes exactly that row, then (and
    // only then) the session itself is torn down.
    expect(calls).toEqual(["register", "delete", "auth.signOut"]);
  });

  // #264 review round 3, finding 2: deleting the `if (status !== "granted") return;` guard from
  // reregisterPushToken left the whole suite green -- nothing exercised the not-granted path. On
  // iOS, calling getExpoPushTokenAsync without permission throws; on Android it may silently mint
  // a token anyway. Neither is what a background refresh should ever do.
  it("notifications enabled but OS permission is not granted: mounting the screen does not fetch or mint a token", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: true }, null);
      if (name === "food_sightings") return emptyTable();
      if (name === "push_tokens") return { delete: jest.fn().mockReturnValue({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }) };
      throw new Error(`unexpected table ${name}`);
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });

    await renderNotifications();
    await flush();

    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // #263: registration must go through the register_push_token RPC (which evicts a shared token
  // from any other owner server-side), never a raw push_tokens upsert -- a raw upsert now fails
  // outright against the unique(platform, token) constraint for a token shared with another user.
  it("registers the push token via register_push_token, not a raw push_tokens upsert", async () => {
    mockTables({ notificationsEnabled: false });
    const root = await renderNotifications();

    const toggle = root.root.findByType(Switch);
    await act(async () => {
      await toggle.props.onValueChange(true);
    });

    expect(mockRpc).toHaveBeenCalledWith("register_push_token", { p_platform: "expo", p_token: "ExponentPushToken[test]" });
    // Registration never touches push_tokens directly anymore -- the RPC does the write server-side.
    expect(mockFrom.mock.calls.some((call) => call[0] === "push_tokens")).toBe(false);
  });
});
