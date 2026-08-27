// #272: two hazards traced in useFavoriteFoodAlerts's toggle() that notificationsScreen.test.tsx
// (which drives the hook through NotificationsBody's UI) can't pin directly -- that screen's own
// toggleNotifications wrapper collapses every truthy `{error}` into the same generic Alert copy, so
// it can't distinguish "profiles.update failed" from "register_push_token failed" by message. This
// file drives the hook directly via a tiny probe component instead, mirroring the mock shapes
// notificationsScreen.test.tsx already established (profilesTable/emptyTable/flush) so both files'
// behavior stays provably in sync.

import renderer, { act } from "react-test-renderer";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";
import { useFavoriteFoodAlerts, type FavoriteFoodAlerts } from "./favoriteFoodAlerts";

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

jest.mock("./favoritesStorage", () => ({
  SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({ getFavorites: jest.fn().mockResolvedValue([]) })),
}));

// PR #286 review round 2: the same in-memory-marker mocking pattern privacyScreen.test.tsx uses for
// sharedStatsSeed -- avoids pulling in the real AsyncStorage native module (this file drives the
// REAL favoriteFoodAlerts.ts, unlike privacyScreen.test.tsx which mocks it away entirely) and gives
// each test precise control over "has this account's favorites already synced from this device".
const mockFavoritesSyncState = { synced: new Set<string>() };
jest.mock("./favoritesSyncMarker", () => ({
  hasSyncedFavorites: (userId: string) => Promise.resolve(mockFavoritesSyncState.synced.has(userId)),
  markFavoritesSynced: (userId: string) => {
    mockFavoritesSyncState.synced.add(userId);
    return Promise.resolve();
  },
}));

function profilesTable(profile: Record<string, unknown>, updateError: unknown = null) {
  const selectBuilder: Record<string, unknown> = {};
  selectBuilder.select = () => selectBuilder;
  selectBuilder.eq = () => selectBuilder;
  selectBuilder.single = () => Promise.resolve({ data: profile, error: null });

  const updateBuilder: Record<string, unknown> = {};
  updateBuilder.eq = () => updateBuilder;
  updateBuilder.then = (resolve: (v: { error: unknown }) => void) => resolve({ error: updateError });

  return { select: selectBuilder.select, update: jest.fn().mockReturnValue(updateBuilder) };
}

const mockFrom = jest.fn();
const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
jest.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// Same fire-once-per-callback-identity mock as notificationsScreen.test.tsx/privacyScreen.test.tsx
// -- an unconditional call every render never lets React's setState bail-out kick in.
const mockSeenFocusCallbacks = new WeakSet<() => void>();
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    callback();
  },
}));

function session(userId: string) {
  return { data: { session: { user: { id: userId, email: `${userId}@umass.edu` } } } };
}

let hookRef: FavoriteFoodAlerts | null = null;
function Probe() {
  hookRef = useFavoriteFoodAlerts();
  return null;
}

async function renderProbe() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<Probe />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return root;
}

async function flush(times = 10) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  hookRef = null;
  mockSyncFavoritedFoods.mockResolvedValue({ error: null });
  (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
  // jest.clearAllMocks() clears call history but NOT a permanent .mockResolvedValue override from a
  // previous test -- reset these two back to the module-mock defaults every test so one test's
  // denied-permission setup can never leak into the next (bit us once: needsPermission tests).
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
  mockFavoritesSyncState.synced.clear();
});

describe("useFavoriteFoodAlerts: toggle() surfaces a real register_push_token failure (#272 item C)", () => {
  // Red-first: before this fix, toggle()'s `if (next) {...}` branch swallowed rpcError and fell
  // through to `return { error: null }` -- the switch stayed optimistically ON with no token behind
  // it, and the caller never learned anything went wrong.
  it("reverts notificationsEnabled and returns a truthful error when register_push_token fails", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: false });
      throw new Error(`unexpected table ${name}`);
    });
    mockRpc.mockResolvedValue({ data: null, error: { message: "must be signed in" } });

    await renderProbe();
    expect(hookRef!.notificationsEnabled).toBe(false);

    let result!: { error: string | null };
    await act(async () => {
      result = await hookRef!.toggle(true);
    });

    expect(result).toEqual({ error: "Couldn't register this device" });
    // The optimistic setNotificationsEnabled(true) that ran earlier in toggle() must be reverted --
    // the device never actually registered, so the switch must not claim it did.
    expect(hookRef!.notificationsEnabled).toBe(false);
  });

  it("returns no error and stays enabled when register_push_token succeeds", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: false });
      throw new Error(`unexpected table ${name}`);
    });
    mockRpc.mockResolvedValue({ data: null, error: null });

    await renderProbe();

    let result!: { error: string | null };
    await act(async () => {
      result = await hookRef!.toggle(true);
    });

    expect(result).toEqual({ error: null });
    expect(hookRef!.notificationsEnabled).toBe(true);
  });
});

describe("useFavoriteFoodAlerts: pending guards the whole toggle() chain (#190)", () => {
  // Red-first: before this fix, FavoriteFoodAlerts had no `pending` field at all -- nothing stopped
  // a rapid second tap from firing another toggle() call while the first was still mid-chain (e.g.
  // waiting on getExpoPushTokenAsync), racing the two chains against each other. notifications.tsx/
  // privacy.tsx wire this into their control's `disabled` prop (#158/#165/#167 convention).
  it("is true only while toggle(true)'s chain is in flight", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: false });
      throw new Error(`unexpected table ${name}`);
    });

    let resolveToken!: (v: { data: string }) => void;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
    );

    await renderProbe();
    expect(hookRef!.pending).toBe(false);

    let togglePromise!: Promise<{ error: string | null }>;
    await act(async () => {
      togglePromise = hookRef!.toggle(true);
      await Promise.resolve();
    });
    // Same generous-overshoot flush notificationsScreen.test.tsx's own flush() doc comment
    // describes -- this chain (profiles.update -> favorites sync -> getPermissionsAsync ->
    // getExpoPushTokenAsync) is deeper than one microtask tick, and the held token promise means
    // it can only ever park mid-chain, never race ahead of this assertion.
    await flush();

    expect(hookRef!.pending).toBe(true);

    resolveToken({ data: "ExponentPushToken[test]" });
    await act(async () => {
      await togglePromise;
    });

    expect(hookRef!.pending).toBe(false);
  });

  // The try/catch's several early `return`s (profileError, rpcError) must all still clear pending
  // via a `finally`, not just the happy path -- otherwise a single failed toggle leaves the control
  // permanently disabled.
  it("clears pending even when profiles.update is rejected, so the control isn't left permanently disabled", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: false }, { message: "row-level security policy violation" });
      throw new Error(`unexpected table ${name}`);
    });

    await renderProbe();
    await act(async () => {
      await hookRef!.toggle(true);
    });

    expect(hookRef!.pending).toBe(false);
  });
});

describe("useFavoriteFoodAlerts: toggle(false) waits for an in-flight self-heal (#272 item B)", () => {
  // Red-first: on main, toggle()'s OFF branch deletes push_tokens immediately with no await on
  // pendingSelfHeal() -- a self-heal register_push_token call already in flight from this same
  // mount's refresh() can land AFTER this delete, resurrecting the row this toggle-off just removed.
  it("does not delete push_tokens until a self-heal registration already in flight has settled, so the row ends up absent, not resurrected", async () => {
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
      if (name === "profiles") return profilesTable({ notifications_enabled: true });
      if (name === "push_tokens") return { delete: pushTokensDelete };
      throw new Error(`unexpected table ${name}`);
    });

    let resolveToken!: (v: { data: string }) => void;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
    );

    await renderProbe();
    await flush(5); // let the mount's own self-heal reach getExpoPushTokenAsync and park on it

    // User flips the switch off while that self-heal is still in flight.
    let togglePromise!: Promise<{ error: string | null }>;
    await act(async () => {
      togglePromise = hookRef!.toggle(false);
      await Promise.resolve();
    });

    // toggle(false) must be blocked waiting on the self-heal here -- its own delete must not have
    // fired yet, since the self-heal's token fetch is still unresolved.
    await flush(3);
    expect(pushTokensDelete).not.toHaveBeenCalled();

    resolveToken({ data: "ExponentPushToken[test]" });
    await act(async () => {
      await togglePromise;
    });
    await flush();

    expect(deleteEq1).toHaveBeenCalledWith("user_id", "me");
    expect(deleteEq2).toHaveBeenCalledWith("platform", "expo");
    // The self-heal's registration must land first, THEN the toggle-off's delete -- never the
    // reverse, which is what would leave the row resurrected under a now-disabled toggle.
    expect(calls).toEqual(["register", "delete"]);
  });
});

describe("useFavoriteFoodAlerts: refresh() never re-registers when notifications_enabled is false (#272 item A guard)", () => {
  // #272 review: item A's whole fix (deleteServerData flipping notifications_enabled to false
  // before the push_tokens delete, privacy.tsx pulling that into the hook via refresh()) only
  // actually prevents resurrection because refresh() itself gates re-registration on `enabled`
  // (:128, `if (enabled) { ... }`). That guard had no direct test -- mutating it to `if (true)`
  // left the whole suite green. This pins it directly: mount with notifications_enabled already
  // false and OS permission already granted (so a missing guard has nothing else stopping it),
  // and assert neither the token fetch nor the RPC ever fires.
  it("mounting with notifications_enabled=false does not fetch a token or call register_push_token, even with permission already granted", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: false });
      throw new Error(`unexpected table ${name}`);
    });

    await renderProbe();
    await flush();

    expect(hookRef!.notificationsEnabled).toBe(false);
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// #277: register_push_token now no-ops server-side (returns no row) when the caller's
// notifications_enabled has gone false between refresh()'s profiles read and reregisterPushToken's
// own network round trip -- the server-side close for the three residual client-side resurrection
// windows #275's review left open. Both RPC call sites (here, and toggle()'s own registration
// above) already destructure only `error`/`rpcError` off the RPC response and never read `data`, so
// this is a pure verification test, not a defensive fix -- it pins that a null `data` from the RPC
// (the shape a server-side no-op now returns) is already handled without throwing or otherwise
// treating it as a failure.
//
// Rework note: the original version of this test asserted only `notificationsEnabled === true`,
// set by refresh() BEFORE reregisterPushToken ever runs -- vacuous regardless of what the RPC
// returns. This version asserts `needsPermission` instead, which IS derived from
// reregisterPushToken's post-RPC outcome, with the device pre-marked synced so a thrown exception
// (mishandling null `data`) flips `granted`/`needsPermission` the other way. This mirrors the
// `#248/#286` "already synced" test below (:398) but pins the null-`data` RPC shape explicitly
// (that test relies on the module default) and asserts the RPC actually fired.
describe("useFavoriteFoodAlerts: refresh()'s self-heal tolerates a null register_push_token result (#277)", () => {
  it("mounting with notifications_enabled=true, permission already granted, and favorites already synced sets needsPermission false when the RPC resolves with null data (server-side no-op)", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: true });
      throw new Error(`unexpected table ${name}`);
    });
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockFavoritesSyncState.synced.add("me");

    await renderProbe();
    await flush();

    expect(mockRpc).toHaveBeenCalledWith("register_push_token", { p_platform: "expo", p_token: "ExponentPushToken[test]" });
    expect(hookRef!.notificationsEnabled).toBe(true);
    // needsPermission only goes false if reregisterPushToken's post-RPC `granted: true` is actually
    // reached -- if a null RPC `data` result were mishandled (thrown instead of tolerated),
    // reregisterPushToken's own catch would return `{ granted: false }` and this would flip true.
    expect(hookRef!.needsPermission).toBe(false);
  });
});

// PR #286 review (Part B): notifications_enabled defaulting true (#248) means a brand-new signed-in
// user can have `notificationsEnabled: true` server-side while this device has never actually
// granted OS notification permission -- no token registered, no favorites synced. Consumers
// (privacy.tsx, notifications.tsx) must render this honestly instead of claiming a working ON
// toggle -- needsPermission is the signal that tells them to.
describe("useFavoriteFoodAlerts: needsPermission (#248/#286)", () => {
  // Mutation-red evidence: removing refresh()'s `setNeedsPermission(!granted)` line (or hardcoding
  // it to `setNeedsPermission(false)`) leaves this false forever, even with permission denied.
  it("mounting with notifications_enabled=true but OS permission denied sets needsPermission true, without prompting", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: true });
      throw new Error(`unexpected table ${name}`);
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });

    await renderProbe();
    await flush();

    expect(hookRef!.notificationsEnabled).toBe(true);
    expect(hookRef!.needsPermission).toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled(); // refresh() never prompts
  });

  // PR #286 review round 2: this used to assert needsPermission=false purely off a granted OS
  // permission -- the reviewer's own probe (a second account signing in on a phone that already
  // granted this app permission, or Android <=12) showed that's not enough: refresh()'s self-heal
  // registers a token and this test's OLD assertion would pass even with `syncFavoritedFoods` never
  // once called for this account (favorited_foods empty server-side, favoritesCount>0 rendered
  // "kept on the server" regardless). Renamed to prove the ACTUAL bug this round fixed: granted
  // permission alone still needs action until this device has synced.
  it("mounting with notifications_enabled=true and OS permission granted, but favorites never synced on this device, still needs action", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: true });
      throw new Error(`unexpected table ${name}`);
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    // mockFavoritesSyncState.synced deliberately left empty -- this account has never synced from
    // this device.

    await renderProbe();
    await flush();

    expect(hookRef!.needsPermission).toBe(true);
    expect(mockSyncFavoritedFoods).not.toHaveBeenCalled(); // refresh() never calls it -- see favoritesSyncMarker.ts
  });

  it("mounting with notifications_enabled=true, OS permission granted, AND favorites already synced on this device sets needsPermission false", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: true });
      throw new Error(`unexpected table ${name}`);
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
    mockFavoritesSyncState.synced.add("me");

    await renderProbe();
    await flush();

    expect(hookRef!.needsPermission).toBe(false);
  });

  it("toggle(true) sets needsPermission true when the user denies the permission prompt", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: false });
      throw new Error(`unexpected table ${name}`);
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });

    await renderProbe();
    await act(async () => {
      await hookRef!.toggle(true);
    });

    expect(hookRef!.needsPermission).toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled(); // toggle() IS allowed to prompt
  });

  it("toggle(true) sets needsPermission false when permission is granted and registration succeeds", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: false });
      throw new Error(`unexpected table ${name}`);
    });

    await renderProbe();
    await act(async () => {
      await hookRef!.toggle(true);
    });

    expect(hookRef!.needsPermission).toBe(false);
  });

  it("toggle(true) marks favorites as synced on success, so a later mount doesn't need action just to re-sync", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: false });
      throw new Error(`unexpected table ${name}`);
    });

    await renderProbe();
    await act(async () => {
      await hookRef!.toggle(true);
    });

    expect(mockFavoritesSyncState.synced.has("me")).toBe(true);
  });

  it("toggle(true) does NOT mark favorites as synced when syncFavoritedFoods itself fails", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: false });
      throw new Error(`unexpected table ${name}`);
    });
    mockSyncFavoritedFoods.mockResolvedValue({ error: { message: "network down" } });

    await renderProbe();
    await act(async () => {
      await hookRef!.toggle(true);
    });

    expect(mockFavoritesSyncState.synced.has("me")).toBe(false);
    expect(hookRef!.needsPermission).toBe(true); // permission granted, but the sync attempt failed
  });

  it("toggle(false) always resets needsPermission to false", async () => {
    mockFrom.mockImplementation((name: string) => {
      if (name === "profiles") return profilesTable({ notifications_enabled: true });
      throw new Error(`unexpected table ${name}`);
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });

    await renderProbe();
    await flush();
    expect(hookRef!.needsPermission).toBe(true); // starts needing permission (mount self-heal)

    await act(async () => {
      await hookRef!.toggle(false);
    });

    expect(hookRef!.needsPermission).toBe(false);
  });
});
