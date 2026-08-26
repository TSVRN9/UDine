// Lives here, not next to src/app/privacy.tsx: expo-router scans every file under src/app/ as a
// candidate route (see redirect.test.tsx's own note) -- imports the screen by relative path
// instead, same pattern as friendProfileScreen.test.tsx/notificationsScreen.test.tsx.
//
// #285 rewrite ("Your Data v3", variant A): three sections -- Stays on this phone (unchanged),
// On UDine's server (SYNC: Favorite foods, Favorite dining halls, Hall completion, Top 5 foods),
// Shared with friends (SHARE: Favorite dining halls -> hall_ranks, Findable by search). The old
// "Delete server data" row is gone -- SYNC toggle off IS the delete now. The favorite-food-alerts
// toggle's own error-handling chain still lives in useFavoriteFoodAlerts (mocked here, covered by
// notificationsScreen.test.tsx) and deleteServerData is no longer referenced by this screen at all
// (covered standalone by deleteServerData.test.ts) -- both out of scope here, same as before.
//
// #285/#248 reconciliation (rebase of PR #305 onto main after #248/PR #286 landed): #248 Part C's
// shared-stats default-on seed and its first-run disclosure card are reintegrated here rather than
// dropped -- see "PrivacyScreen: shared-stats default-on seed (#248 Part C)" below. The seed still
// pushes all three shared_stats fields (completion, top_foods, hall_ranks); in THIS screen's layout
// that means the SYNC toggles for Hall completion/Top 5 foods AND the SHARE toggle for Favorite
// dining halls all read ON for a freshly seeded account.

jest.mock("./sqliteStorage", () => {
  const getAllEntries = jest.fn().mockResolvedValue([]);
  return { SqliteLogStorage: jest.fn().mockImplementation(() => ({ getAllEntries })) };
});
jest.mock("./rankingStorage", () => {
  const getRankedDishes = jest.fn().mockResolvedValue([]);
  const getRankedFoods = jest.fn().mockResolvedValue([]);
  return { SqliteRankingStorage: jest.fn().mockImplementation(() => ({ getRankedDishes, getRankedFoods })) };
});
jest.mock("./seenDishesStorage", () => {
  const getAllSeenDishNames = jest.fn().mockResolvedValue(new Map());
  return { SqliteSeenDishesStorage: jest.fn().mockImplementation(() => ({ getAllSeenDishNames })) };
});

// PR #286 review: this needs to be a STATEFUL stand-in for the server's shared_stats row, not a
// fixed resolved value -- the partial-seed tests below render the screen through a SECOND focus and
// must see back what the FIRST focus actually wrote (a static mock can never fail that way, which is
// exactly how the pre-fix "next focus can retry" test passed despite the real code never retrying).
// Reset to null (no row) in beforeEach; mockTables' sharedStatsRow option seeds an initial value for
// tests that want to start with a pre-existing row.
let mockSharedStatsServerRow: { completion: unknown; top_foods: unknown; hall_ranks: unknown } | null = null;
function mockSyncSharedStatDefaultImpl(_client: unknown, _userId: string, field: string, value: unknown) {
  mockSharedStatsServerRow = {
    completion: mockSharedStatsServerRow?.completion ?? null,
    top_foods: mockSharedStatsServerRow?.top_foods ?? null,
    hall_ranks: mockSharedStatsServerRow?.hall_ranks ?? null,
    [field]: value,
  };
  return Promise.resolve({ error: null });
}
// Loose jest.fn() (no inferred tuple type from mockSyncSharedStatDefaultImpl's signature) so this
// stays spreadable (mockSyncSharedStat(...args)) and every existing mockResolvedValue({error:{...}})
// / mockImplementationOnce(...) override below keeps type-checking against `unknown`, not `null`.
const mockSyncSharedStat = jest.fn();
mockSyncSharedStat.mockImplementation(mockSyncSharedStatDefaultImpl);
const mockSyncDiningHallRanks = jest.fn().mockResolvedValue(undefined);
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  syncSharedStat: (...args: unknown[]) => mockSyncSharedStat(...args),
  syncDiningHallRanks: (...args: unknown[]) => mockSyncDiningHallRanks(...args),
}));

// #248 Part C: a tiny in-memory stand-in for AsyncStorage's two per-user markers -- real behavior
// (persists across this screen's own refresh() calls within a test) without pulling in the
// AsyncStorage mock, since sharedStatsSeed.ts's own IO is covered directly by sharedStatsSeed.test.ts.
const mockSharedStatsSeedState = { seeded: new Set<string>(), disclosureDismissed: new Set<string>() };
// PR #286 review: markSharedStatsDefaultSeeded is its own jest.fn() (not just a state mutation) so
// "seeds exactly once" can assert on CALL COUNT -- a plain Set membership check can't tell "marked
// once" apart from "marked twice, ending up true either way", and a raw push-count assertion is no
// longer a valid proxy for that once the shared_stats mock became stateful (a second focus
// legitimately re-pushes already-opted-in fields via the unrelated fieldsNeedingRefresh loop; see
// mockSyncSharedStatDefaultImpl above).
const mockMarkSharedStatsDefaultSeeded = jest.fn((userId: string) => {
  mockSharedStatsSeedState.seeded.add(userId);
  return Promise.resolve();
});
jest.mock("./sharedStatsSeed", () => ({
  hasSeededSharedStatsDefault: (userId: string) => Promise.resolve(mockSharedStatsSeedState.seeded.has(userId)),
  markSharedStatsDefaultSeeded: (userId: string) => mockMarkSharedStatsDefaultSeeded(userId),
  isSharedStatsDisclosureDismissed: (userId: string) => Promise.resolve(mockSharedStatsSeedState.disclosureDismissed.has(userId)),
  dismissSharedStatsDisclosure: (userId: string) => {
    mockSharedStatsSeedState.disclosureDismissed.add(userId);
    return Promise.resolve();
  },
}));

const alertsState = { notificationsEnabled: false, favoritesCount: 0, needsPermission: false };
const mockToggleAlerts = jest.fn().mockResolvedValue({ error: null });
const mockRefreshAlerts = jest.fn().mockResolvedValue(undefined);
jest.mock("./favoriteFoodAlerts", () => ({
  useFavoriteFoodAlerts: () => ({ session: null, ...alertsState, toggle: mockToggleAlerts, refresh: mockRefreshAlerts }),
}));

// #285: device-local "sync favorite dining halls" preference -- defaults to enabled, mutable per
// test via mockHallSyncStore so a test can start the screen already opted out.
let mockHallSyncStore = true;
const mockSetHallSyncEnabled = jest.fn(async (v: boolean) => {
  mockHallSyncStore = v;
});
jest.mock("./hallSyncPreference", () => ({
  isHallSyncEnabled: () => Promise.resolve(mockHallSyncStore),
  setHallSyncEnabled: (v: boolean) => mockSetHallSyncEnabled(v),
}));

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
// privacy.tsx's refresh() always builds fresh objects (setCounts(deviceDataCounts(...)), a new
// friendships array, ...) -- calling useFocusEffect's callback unconditionally on every render
// never lets React's setState bail-out kick in and spins until Jest's test timeout. Same hazard/
// fix as friendsScreen.test.tsx/notificationsScreen.test.tsx: fire once per distinct callback
// identity (i.e. once per `[session]` dependency change).
const mockSeenFocusCallbacks = new WeakSet<() => void>();
// #248 Part C's "seed once, not on every focus" tests need to simulate a SECOND focus of the same
// screen instance (navigate away and back) without a session change -- captured here so a test can
// re-invoke the exact callback react-navigation would re-invoke, bypassing only the WeakSet dedup
// this mock otherwise uses to avoid the infinite-refresh hazard noted above.
let mockLastFocusCallback: (() => void) | null = null;
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args), back: (...args: unknown[]) => mockRouterBack(...args) },
  useFocusEffect: (callback: () => void) => {
    mockLastFocusCallback = callback;
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    callback();
  },
}));

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

/** Chainable query-builder stub, same shape as friendsScreen.test.tsx's `table()`. `.maybeSingle`
 * resolves `getSingleRow()` when given (a LIVE read, for shared_stats -- see mockSharedStatsServerRow
 * above) or else the fixed `singleRow` a test supplies; `.delete().eq()`/`.update().eq()` resolve a
 * configurable `{ error }`; the plain select chain resolves `{ data: rows }`. */
function table(
  rows: Record<string, unknown>[],
  opts: { deleteError?: unknown; singleRow?: Record<string, unknown> | null; getSingleRow?: () => Record<string, unknown> | null; updateError?: unknown } = {},
) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.or = chain;
  builder.maybeSingle = () => Promise.resolve({ data: (opts.getSingleRow ? opts.getSingleRow() : opts.singleRow) ?? null, error: null });
  builder.then = (resolve: (v: { data: unknown[] }) => void) => resolve({ data: rows });

  const deleteBuilder: Record<string, unknown> = {};
  deleteBuilder.eq = () => deleteBuilder;
  deleteBuilder.or = () => deleteBuilder;
  deleteBuilder.then = (resolve: (v: { error: unknown }) => void) => resolve({ error: opts.deleteError ?? null });
  builder.delete = jest.fn().mockReturnValue(deleteBuilder);

  const updateBuilder: Record<string, unknown> = {};
  updateBuilder.eq = () => updateBuilder;
  updateBuilder.then = (resolve: (v: { error: unknown }) => void) => resolve({ error: opts.updateError ?? null });
  builder.update = jest.fn().mockReturnValue(updateBuilder);

  return builder;
}

const mockFrom = jest.fn();
jest.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import renderer, { act } from "react-test-renderer";
import { Alert, Text } from "react-native";
import { Toggle } from "../components/ui";
import { supabase } from "./supabase";
import PrivacyScreen from "../app/privacy";

// createdAt defaults to well before #248 Part C's 2026-08-26 ship date -- every pre-existing test in
// this file calls session() without a createdAt, and must keep exercising the "existing account,
// never auto-seeded" path unchanged. Part C's own tests below pass an explicit post-ship createdAt.
function session(userId: string, email = `${userId}@umass.edu`, createdAt = "2020-01-01T00:00:00.000Z") {
  return { data: { session: { user: { id: userId, email, created_at: createdAt } } } };
}

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children)))
    .join(" | ");
}

function mockTables(
  opts: {
    sharedStatsRow?: Record<string, unknown> | null;
    friendships?: Record<string, unknown>[];
    discoverable?: boolean | null;
    favoriteDiningHallsDeleteError?: unknown;
    profilesUpdateError?: unknown;
  } = {},
) {
  // Seeds the LIVE server-row stand-in (only when a test explicitly passes sharedStatsRow -- most
  // tests call mockTables() with no args just to (re)wire friendships/profiles, and must not stomp
  // whatever mockSyncSharedStat has already written this test, e.g. mid-seed).
  if (opts.sharedStatsRow !== undefined) mockSharedStatsServerRow = opts.sharedStatsRow as typeof mockSharedStatsServerRow;
  mockFrom.mockImplementation((name: string) => {
    if (name === "shared_stats") return table([], { getSingleRow: () => mockSharedStatsServerRow });
    if (name === "friendships") return table(opts.friendships ?? []);
    if (name === "profiles") return table([], { singleRow: { discoverable: opts.discoverable ?? true }, updateError: opts.profilesUpdateError ?? null });
    if (name === "favorite_dining_halls") return table([], { deleteError: opts.favoriteDiningHallsDeleteError ?? null });
    throw new Error(`unexpected table ${name}`);
  });
}

async function renderScreen() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<PrivacyScreen />);
  });
  // #248 Part C's seed block chains several more sequential awaits onto refresh() (the seeded-marker
  // read, up to three syncSharedStat pushes, the marker write, the disclosure-dismissed read) than
  // this screen had before -- flushed with extra rounds so every test (seeding or not) observes the
  // fully-settled state, not a mid-flight one. Extra rounds are a no-op once the queue is idle.
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return root;
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockSharedStatsServerRow = null;
  mockSyncSharedStat.mockImplementation(mockSyncSharedStatDefaultImpl);
  mockSyncDiningHallRanks.mockResolvedValue(undefined);
  mockToggleAlerts.mockResolvedValue({ error: null });
  mockRefreshAlerts.mockResolvedValue(undefined);
  alertsState.notificationsEnabled = false;
  alertsState.favoritesCount = 0;
  alertsState.needsPermission = false;
  mockHallSyncStore = true;
  mockSharedStatsSeedState.seeded.clear();
  mockSharedStatsSeedState.disclosureDismissed.clear();
  mockLastFocusCallback = null;
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockTables();
});

afterEach(() => {
  alertSpy.mockRestore();
});

// Toggle order once signed in, per privacy.tsx's JSX: [0] alerts, [1] hall-sync SYNC,
// [2] completion, [3] top_foods, [4] hall_ranks SHARE, [5] findable.
const TOGGLE = { alerts: 0, hallSync: 1, completion: 2, topFoods: 3, hallRanksShare: 4, findable: 5 };

describe("PrivacyScreen: device-local data map", () => {
  it("renders live local counts with no session at all -- this card needs no account", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    const root = await renderScreen();
    const body = texts(root);
    expect(body).toMatch(/0 entries/);
    expect(body).toMatch(/0 ranked/);
    expect(body).toMatch(/0 dishes/);
    // Server/shared sections don't render without a session.
    expect(root.root.findAllByType(Toggle)).toHaveLength(0);
  });

  it("EXPORT row navigates to /export", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    const root = await renderScreen();
    const exportNode = root.root.findAllByType(Text).find((n) => n.props.children === "EXPORT · JSON / CSV");
    expect(exportNode).toBeTruthy();
    let node = exportNode!.parent;
    while (node && typeof node.props.onPress !== "function") node = node.parent;
    node!.props.onPress();
    expect(mockRouterPush).toHaveBeenCalledWith("/export");
  });
});

describe("PrivacyScreen: three-section layout (#285)", () => {
  it("renders exactly 6 toggles (4 SYNC + 2 SHARE) and no Delete server data row", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();
    expect(root.root.findAllByType(Toggle)).toHaveLength(6);
    const body = texts(root);
    expect(body).toMatch(/On UDine's server/);
    expect(body).toMatch(/Shared with friends/);
    expect(body).toMatch(/Favorite foods/);
    expect(body).toMatch(/Favorite dining halls/);
    expect(body).toMatch(/Hall completion/);
    expect(body).toMatch(/Top 5 foods/);
    expect(body).toMatch(/Findable by search/);
    expect(body).not.toMatch(/Delete server data/);
  });

  // Rework of #305's review: completion/top_foods moved into the SYNC section, but they're still
  // friend-visible (syncing IS sharing for these two, per the SHARE-section comment) -- the SYNC
  // footer must say so too, not just the SHARE section's own footer. Asserting a count of 2 (not
  // just "toMatch") so this fails on the pre-fix copy, which only has the SHARE section's footer.
  it("SYNC section footer still discloses that hall completion / top 5 foods are friends-only", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();
    const matches = texts(root).match(/accepted friends only/gi) ?? [];
    expect(matches.length).toBe(2); // once for the SYNC section, once for SHARE
  });

  it("each SYNC/SHARE toggle reflects its own backing value independently", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockHallSyncStore = false;
    mockTables({ sharedStatsRow: { completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: null, hall_ranks: [{ hallTid: 1, rank: 1 }] }, discoverable: false });
    const root = await renderScreen();
    const toggles = root.root.findAllByType(Toggle);
    expect(toggles[TOGGLE.alerts].props.value).toBe(false);
    expect(toggles[TOGGLE.hallSync].props.value).toBe(false);
    expect(toggles[TOGGLE.completion].props.value).toBe(true);
    expect(toggles[TOGGLE.topFoods].props.value).toBe(false);
    expect(toggles[TOGGLE.hallRanksShare].props.value).toBe(true);
    expect(toggles[TOGGLE.findable].props.value).toBe(false);
  });
});

describe("PrivacyScreen: SYNC stat toggles (hall completion / top 5 foods)", () => {
  it("toggling a SYNC stat ON pushes that field's freshly derived value, not another field's", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();
    const topFoodsToggle = root.root.findAllByType(Toggle)[TOGGLE.topFoods];

    await act(async () => {
      topFoodsToggle.props.onValueChange(true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSyncSharedStat).toHaveBeenCalledWith(expect.anything(), "me", "top_foods", []);
  });

  it("toggling a SYNC stat OFF pushes null -- a revoke, not a no-op", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockTables({ sharedStatsRow: { completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: null, hall_ranks: null } });
    const root = await renderScreen();
    const completionToggle = root.root.findAllByType(Toggle)[TOGGLE.completion];

    await act(async () => {
      completionToggle.props.onValueChange(false);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSyncSharedStat).toHaveBeenCalledWith(expect.anything(), "me", "completion", null);
  });

  it("reverts the toggle and shows a message when the sync fails -- doesn't silently claim success", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockSyncSharedStat.mockResolvedValue({ error: { message: "network down" } });
    const root = await renderScreen();
    const completionToggle = root.root.findAllByType(Toggle)[TOGGLE.completion];
    expect(completionToggle.props.value).toBe(false);

    await act(async () => {
      completionToggle.props.onValueChange(true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const after = root.root.findAllByType(Toggle)[TOGGLE.completion];
    expect(after.props.value).toBe(false); // reverted, not optimistically left on
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't update sharing", expect.any(String));
  });

  // #186: refresh()'s own re-push loop (fieldsNeedingRefresh -> syncSharedStat) can still be
  // mid-flight -- parked on an unrelated await -- when the user revokes a field via toggleShared.
  // Without the generationRef guard, the parked loop resumes afterward and re-pushes the field's
  // OLD (still-opted-in) value, resurrecting a stat the user just deleted server-side.
  it("#186: a toggle that revokes a field while refresh is mid-flight is not resurrected by refresh's stale re-push", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));

    let resolveFriendships!: (v: { data: unknown[] }) => void;
    const friendshipsPromise = new Promise<{ data: unknown[] }>((resolve) => {
      resolveFriendships = resolve;
    });
    mockFrom.mockImplementation((name: string) => {
      if (name === "shared_stats") return table([], { singleRow: { completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: null, hall_ranks: null } });
      if (name === "profiles") return table([], { singleRow: { discoverable: true } });
      if (name === "friendships") {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.or = () => builder;
        builder.then = (resolve: (v: { data: unknown[] }) => void) => friendshipsPromise.then(resolve);
        return builder;
      }
      throw new Error(`unexpected table ${name}`);
    });

    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<PrivacyScreen />);
    });
    // Flush enough microtasks for the session to resolve and refresh() to reach (and park on)
    // the friendships await -- shared_stats has already resolved by this point (setRow ran), so
    // the completion toggle already reflects the fetched row.
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const beforeToggle = root.root.findAllByType(Toggle)[TOGGLE.completion];
    expect(beforeToggle.props.value).toBe(true); // confirms refresh's shared_stats read landed

    // User revokes "Hall completion" while refresh is still parked on the friendships await.
    await act(async () => {
      beforeToggle.props.onValueChange(false);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockSyncSharedStat).toHaveBeenLastCalledWith(expect.anything(), "me", "completion", null);

    // Now let refresh's parked friendships await resolve -- its re-push loop sees `toRefresh`
    // still contains "completion" (captured from the row it read before the toggle) and would,
    // without the guard, re-push a fresh non-null payload for it.
    await act(async () => {
      resolveFriendships({ data: [] });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The LAST write for "completion" must still be the revoke (null) -- the stale re-push, if
    // it ran, would be a later call with a non-null array.
    const completionCalls = mockSyncSharedStat.mock.calls.filter((c) => c[2] === "completion");
    expect(completionCalls[completionCalls.length - 1][3]).toBeNull();
  });
});

describe("PrivacyScreen: shared-stats default-on seed (#248 Part C)", () => {
  const NEW_ACCOUNT_CREATED_AT = "2026-09-01T00:00:00.000Z"; // after the 2026-08-26 ship date

  function sharedFieldPushes() {
    return mockSyncSharedStat.mock.calls.filter((c) => c[1] === "me" && ["completion", "top_foods", "hall_ranks"].includes(c[2] as string));
  }

  it("seeds a brand-new account's shared_stats row on first load, pushing all three fields ON", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    const root = await renderScreen();

    expect(sharedFieldPushes().map((c) => c[2])).toEqual(expect.arrayContaining(["completion", "top_foods", "hall_ranks"]));
    sharedFieldPushes().forEach((c) => expect(c[3]).not.toBeNull()); // ON, not a revoke
    // Hall completion / Top 5 foods (SYNC) and Favorite dining halls (SHARE) all read ON afterward.
    const toggles = root.root.findAllByType(Toggle);
    expect(toggles[TOGGLE.completion].props.value).toBe(true);
    expect(toggles[TOGGLE.topFoods].props.value).toBe(true);
    expect(toggles[TOGGLE.hallRanksShare].props.value).toBe(true);
    // Fields the seed never touches stay at their own defaults: alerts off (DB default, mocked
    // off here), hall-sync SYNC on (device-local, defaults enabled for every device), findable on
    // (profiles.discoverable default).
    expect(toggles[TOGGLE.alerts].props.value).toBe(false);
    expect(toggles[TOGGLE.hallSync].props.value).toBe(true);
    expect(toggles[TOGGLE.findable].props.value).toBe(true);
    expect(mockSharedStatsSeedState.seeded.has("me")).toBe(true);
  });

  it("does not seed an existing (pre-ship-date) account, even though its row is also null", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me")); // default createdAt: 2020
    const root = await renderScreen();

    expect(sharedFieldPushes()).toEqual([]);
    const toggles = root.root.findAllByType(Toggle);
    expect(toggles[TOGGLE.completion].props.value).toBe(false);
    expect(toggles[TOGGLE.topFoods].props.value).toBe(false);
    expect(toggles[TOGGLE.hallRanksShare].props.value).toBe(false);
    expect(mockSharedStatsSeedState.seeded.has("me")).toBe(false);
  });

  // The case a naive "any field non-null?" re-seed check would get wrong: a row that EXISTS, with
  // every column null, is a user who opted in and then turned everything back off -- not a fresh
  // account. row === null (not "every field null") is what privacySettings.ts's
  // shouldSeedSharedStatsDefault actually gates on; this proves the screen wires that correctly.
  it("does not re-seed a new-account user who has since turned every shared stat off", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    mockTables({ sharedStatsRow: { completion: null, top_foods: null, hall_ranks: null } });
    const root = await renderScreen();

    expect(sharedFieldPushes()).toEqual([]);
    const toggles = root.root.findAllByType(Toggle);
    expect(toggles[TOGGLE.completion].props.value).toBe(false);
    expect(toggles[TOGGLE.topFoods].props.value).toBe(false);
    expect(toggles[TOGGLE.hallRanksShare].props.value).toBe(false);
  });

  // The only reason the persisted (not just in-memory) marker exists: turning every SYNC toggle off
  // deletes the shared_stats row entirely (see toggleShared/toggleHallSync), so a re-focus afterward
  // sees row === null again -- identical to a never-seeded new account. Without the marker surviving
  // that, this would resurrect exactly what the user just explicitly removed.
  it("does not re-seed after the row was cleared -- the marker survives the row going back to null", async () => {
    mockSharedStatsSeedState.seeded.add("me"); // simulates: this account was already seeded once
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    mockTables({ sharedStatsRow: null }); // simulates: shared_stats row is gone after turning every SYNC/SHARE toggle off
    const root = await renderScreen();

    expect(sharedFieldPushes()).toEqual([]);
    const toggles = root.root.findAllByType(Toggle);
    expect(toggles[TOGGLE.completion].props.value).toBe(false);
    expect(toggles[TOGGLE.topFoods].props.value).toBe(false);
    expect(toggles[TOGGLE.hallRanksShare].props.value).toBe(false);
  });

  // Mutation-red evidence: flip shouldSeedSharedStatsDefault's `!opts.alreadySeeded` gate to always
  // pass (e.g. `true ||`) and markSharedStatsDefaultSeeded gets called a SECOND time on the second
  // focus -- the seed decision would re-fire on every focus, not once. Simulates a second focus of
  // the SAME screen instance (user swipes away and back) by re-invoking the exact callback
  // react-navigation would re-invoke, bypassing only this test file's own WeakSet dedup (a
  // jsdom-only guard against a real render loop, not something react-navigation has).
  //
  // PR #286 review: asserting on raw push COUNT (3, not 6) stopped discriminating "seeded once" once
  // the shared_stats mock became stateful -- a second focus legitimately re-pushes the now-non-null
  // fields via the pre-existing, unrelated fieldsNeedingRefresh loop (#94's own "re-affirm on every
  // focus" behavior), so 6 raw pushes on a second focus is expected and correct, not a seed bug.
  // markSharedStatsDefaultSeeded's own call count is what actually answers "did the SEED decision
  // fire twice" -- fieldsNeedingRefresh never calls it.
  it("seeds exactly once across repeated focuses of the same screen instance, not on every focus", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    await renderScreen();
    expect(sharedFieldPushes()).toHaveLength(3);
    expect(mockMarkSharedStatsDefaultSeeded).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockLastFocusCallback!();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });

    // The re-affirm loop legitimately re-pushes all 3 already-opted-in fields (6 total pushes now),
    // but the SEED itself must still have fired exactly once.
    expect(sharedFieldPushes()).toHaveLength(6);
    expect(mockMarkSharedStatsDefaultSeeded).toHaveBeenCalledTimes(1);
  });

  // PR #286 review: the marker (and the disclosure it gates) must be written on ANY successful
  // push, not only a clean sweep of all three -- a field that already landed before a later field
  // fails is genuinely shared server-side already, which is what makes the disclosure obligation
  // true. This test proves that directly: completion succeeds, top_foods fails, and the account is
  // still marked seeded/disclosed; hall_ranks (never attempted) and top_foods (attempted once, and
  // failed) are never retried on a later focus.
  it("a partial seed (one field succeeds, one fails) still marks the account seeded and discloses it -- and the failed field is never retried", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    mockSyncSharedStat.mockImplementationOnce(mockSyncSharedStatDefaultImpl).mockImplementationOnce(() => Promise.resolve({ error: { message: "network down" } }));
    const root = await renderScreen();

    // completion (pushed first, succeeded) reads ON; top_foods/hall_ranks (never got a turn once
    // top_foods failed and the loop broke) stay OFF. top_foods itself WAS attempted once, right here.
    const toggles = root.root.findAllByType(Toggle);
    expect(toggles[TOGGLE.completion].props.value).toBe(true);
    expect(toggles[TOGGLE.topFoods].props.value).toBe(false);
    expect(toggles[TOGGLE.hallRanksShare].props.value).toBe(false);
    expect(mockSyncSharedStat.mock.calls.map((c) => c[2])).toEqual(["completion", "top_foods"]);
    expect(mockSharedStatsSeedState.seeded.has("me")).toBe(true); // marked seeded on partial success, not just a full sweep
    expect(texts(root)).toMatch(/on by default/i); // disclosure shows -- the user WAS shared without asking

    // A second focus must not RE-attempt the field that already failed -- the marker is already
    // set, and the row (completion set, top_foods/hall_ranks still null) makes
    // shouldSeedSharedStatsDefault's row === null gate block a re-seed too. fieldsNeedingRefresh's
    // unrelated re-affirm loop only re-pushes the one field that's actually non-null (completion);
    // hall_ranks (never attempted at all) and top_foods (attempted once, above, and failed) are
    // never touched again -- the failed field's one attempt is the only attempt it ever gets.
    await act(async () => {
      mockLastFocusCallback!();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
    const pushedFields = mockSyncSharedStat.mock.calls.map((c) => c[2]);
    expect(pushedFields.filter((f) => f === "top_foods")).toHaveLength(1); // still just the one, original attempt
    expect(pushedFields).not.toContain("hall_ranks"); // never attempted, ever
  });

  // The #186/#241/#217 guard, reused here rather than a new one: a toggle firing WHILE the seed
  // loop is mid-flight must stop the remaining pushes and must not let the seed's own later
  // iteration clobber the LOCAL `row` state the toggle just set.
  it("a toggle firing mid-seed on the SAME field stops the remaining pushes, keeps the toggle's own value, but still credits the seed", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    let resolveFirstPush!: (v: { error: null }) => void;
    const firstPushPromise = new Promise<{ error: null }>((resolve) => {
      resolveFirstPush = resolve;
    });
    mockSyncSharedStat.mockImplementationOnce(() => firstPushPromise); // seed's first field push (completion) parks here

    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<PrivacyScreen />);
    });
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(mockSyncSharedStat).toHaveBeenCalledTimes(1); // parked mid-seed, top_foods/hall_ranks not pushed yet

    // User toggles "Hall completion" off while the seed's first push is still in flight.
    const completionToggle = root.root.findAllByType(Toggle)[TOGGLE.completion];
    await act(async () => {
      completionToggle.props.onValueChange(false);
      await Promise.resolve();
    });
    expect(mockSyncSharedStat).toHaveBeenLastCalledWith(expect.anything(), "me", "completion", null);

    // Now let the seed's parked first push resolve -- its loop must see generationRef bumped and
    // stop, not go on to push top_foods/hall_ranks, and must not overwrite the toggle's own local
    // `row` write with its own (now-stale) ON value.
    await act(async () => {
      resolveFirstPush({ error: null });
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });

    const pushedFields = mockSyncSharedStat.mock.calls.map((c) => c[2]);
    expect(pushedFields).not.toContain("top_foods");
    expect(pushedFields).not.toContain("hall_ranks");
    expect(root.root.findAllByType(Toggle)[TOGGLE.completion].props.value).toBe(false); // the toggle's own OFF wins locally
    expect(mockSharedStatsSeedState.seeded.has("me")).toBe(true); // but the seed's landed write still counts
  });

  // A toggle on a DIFFERENT field racing in DURING field 1's own in-flight push must not erase
  // credit for that push once it lands.
  it("a toggle on a DIFFERENT field firing mid-seed does not erase credit for a field that already succeeded", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    let resolveFirstPush!: (v: { error: null }) => void;
    const firstPushPromise = new Promise<{ error: null }>((resolve) => {
      resolveFirstPush = resolve;
    });
    mockSyncSharedStat.mockImplementationOnce(() => firstPushPromise); // seed's first field push (completion) parks here

    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<PrivacyScreen />);
    });
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(mockSyncSharedStat).toHaveBeenCalledTimes(1); // parked on completion, nothing else pushed yet

    // User manually toggles "Top 5 foods" ON -- a DIFFERENT field than the one currently in flight --
    // while completion's push is still parked.
    const topFoodsToggle = root.root.findAllByType(Toggle)[TOGGLE.topFoods];
    await act(async () => {
      topFoodsToggle.props.onValueChange(true);
      await Promise.resolve();
    });
    expect(mockSyncSharedStat).toHaveBeenLastCalledWith(expect.anything(), "me", "top_foods", expect.anything());

    // Now let completion's parked push resolve successfully -- the race happened DURING this exact
    // await, on a different field. The seed loop must still credit completion's landed write (and
    // still correctly stop rather than going on to push hall_ranks).
    await act(async () => {
      resolveFirstPush({ error: null });
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });

    expect(mockSharedStatsSeedState.seeded.has("me")).toBe(true); // completion's write landed -- credited despite the different-field race
    const pushedFields = mockSyncSharedStat.mock.calls.map((c) => c[2]);
    expect(pushedFields).not.toContain("hall_ranks"); // loop still stopped, never reached the third field
  });

  it("shows the first-run disclosure once a new account is seeded, and dismissing it persists the dismissal", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    const root = await renderScreen();

    expect(texts(root)).toMatch(/on by default/i);
    const gotIt = root.root.findAllByType(Text).find((n) => n.props.children === "GOT IT");
    let node = gotIt!.parent;
    while (node && typeof node.props.onPress !== "function") node = node.parent;
    await act(async () => {
      node!.props.onPress();
      await Promise.resolve();
    });

    expect(mockSharedStatsSeedState.disclosureDismissed.has("me")).toBe(true);
  });

  it("never shows the disclosure for an existing account that was never auto-seeded", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me")); // default: pre-ship createdAt
    const root = await renderScreen();
    expect(texts(root)).not.toMatch(/on by default/i);
  });

  it("does not show the disclosure again once already dismissed in a previous session", async () => {
    mockSharedStatsSeedState.seeded.add("me");
    mockSharedStatsSeedState.disclosureDismissed.add("me");
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    mockTables({ sharedStatsRow: { completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: [], hall_ranks: [] } });
    const root = await renderScreen();

    expect(texts(root)).not.toMatch(/on by default/i);
    // Already-seeded values still render normally -- dismissing the note doesn't touch the toggles.
    expect(root.root.findAllByType(Toggle)[TOGGLE.completion].props.value).toBe(true);
  });

  // No footer/disclosure copy anywhere on this screen may claim the old "off by default" law --
  // #248 Part C superseded it, and this screen's own copy (SYNC/SHARE footers, the disclosure card)
  // must never regress back to implying the opposite of what's actually true.
  it("no footer or disclosure copy claims stats are off by default", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();
    expect(texts(root)).not.toMatch(/[Oo]ff by default/);
  });
});

describe("PrivacyScreen: favorite-food alerts toggle", () => {
  it("renders the hook's current state and delegates the toggle to it", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    alertsState.notificationsEnabled = true;
    alertsState.favoritesCount = 3;
    const root = await renderScreen();
    expect(texts(root)).toMatch(/keeps your 3 favorites on the server to watch menus/);
    const alertsToggle = root.root.findAllByType(Toggle)[TOGGLE.alerts];
    expect(alertsToggle.props.value).toBe(true);

    await act(async () => {
      alertsToggle.props.onValueChange(false);
    });
    expect(mockToggleAlerts).toHaveBeenCalledWith(false);
  });

  // PR #286 review (Part B): notifications_enabled defaulting true (#248) means a new user's flag
  // can be true server-side with NO OS permission granted -- rendering ON here would be exactly the
  // lie the review flagged (alertsSubline claims N favorites are "kept on the server" when nothing
  // has ever synced). needsPermission (useFavoriteFoodAlerts) must flip this row to a needs-action
  // prompt instead. Mutation-red evidence: reverting the Toggle's value back to plain
  // `alerts.notificationsEnabled` (dropping `&& !alerts.needsPermission`) turns this test's first
  // assertion red (`alertsToggle.props.value` would read `true`).
  it("renders a needs-action prompt, not ON, when notifications_enabled is true but OS permission isn't granted yet", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    alertsState.notificationsEnabled = true;
    alertsState.needsPermission = true;
    alertsState.favoritesCount = 3;
    const root = await renderScreen();

    const alertsToggle = root.root.findAllByType(Toggle)[TOGGLE.alerts];
    expect(alertsToggle.props.value).toBe(false); // NOT ON, even though notificationsEnabled is true
    expect(texts(root)).toMatch(/tap to finish turning on/i);
    expect(texts(root)).not.toMatch(/keeps your 3 favorites on the server/);

    // Tapping it (the toggle reads OFF, so this is `onValueChange(true)`) must still call
    // toggle(true) -- the same, only path that ever requests OS permission -- not some other action.
    await act(async () => {
      alertsToggle.props.onValueChange(true);
    });
    expect(mockToggleAlerts).toHaveBeenCalledWith(true);
  });

  // Mutation-based red evidence: with the `if (error) Alert.alert(...)` guard in privacy.tsx
  // removed/inverted, this test fails (no Alert.alert call observed) even though toggle() itself
  // is mocked to fail -- proving THIS screen's wiring surfaces the hook's failure, not just that
  // the hook itself has error handling (that's useFavoriteFoodAlerts/notificationsScreen.test.tsx's
  // job).
  it("shows a message when the hook reports a failure", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockToggleAlerts.mockResolvedValue({ error: "Couldn't update notifications" });
    const root = await renderScreen();
    const alertsToggle = root.root.findAllByType(Toggle)[TOGGLE.alerts];

    await act(async () => {
      await alertsToggle.props.onValueChange(true);
    });

    expect(Alert.alert).toHaveBeenCalledWith("Couldn't update notifications", expect.any(String));
  });
});

describe("PrivacyScreen: Favorite dining halls SYNC toggle (#285)", () => {
  it("reads the device-local hall-sync preference on load", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockHallSyncStore = false;
    const root = await renderScreen();
    expect(root.root.findAllByType(Toggle)[TOGGLE.hallSync].props.value).toBe(false);
  });

  it("turning SYNC off deletes favorite_dining_halls AND clears its SHARE pair (hall_ranks) immediately -- the cascade", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockTables({ sharedStatsRow: { completion: null, top_foods: null, hall_ranks: [{ hallTid: 1, rank: 1 }] } });
    const root = await renderScreen();
    expect(root.root.findAllByType(Toggle)[TOGGLE.hallRanksShare].props.value).toBe(true);

    await act(async () => {
      root.root.findAllByType(Toggle)[TOGGLE.hallSync].props.onValueChange(false);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFrom).toHaveBeenCalledWith("favorite_dining_halls");
    expect(mockSyncSharedStat).toHaveBeenCalledWith(expect.anything(), "me", "hall_ranks", null);
    expect(mockSetHallSyncEnabled).toHaveBeenCalledWith(false);
    expect(root.root.findAllByType(Toggle)[TOGGLE.hallSync].props.value).toBe(false);
    expect(root.root.findAllByType(Toggle)[TOGGLE.hallRanksShare].props.value).toBe(false);
  });

  it("turning SYNC back on re-pushes the current ranking immediately, and persists the preference", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockHallSyncStore = false;
    const root = await renderScreen();

    await act(async () => {
      root.root.findAllByType(Toggle)[TOGGLE.hallSync].props.onValueChange(true);
      await Promise.resolve();
    });

    expect(mockSyncDiningHallRanks).toHaveBeenCalledWith(expect.anything(), "me", []);
    expect(mockSetHallSyncEnabled).toHaveBeenCalledWith(true);
  });

  it("SHARE row for favorite dining halls is disabled with 'turn on sync above to share' while SYNC is off", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockHallSyncStore = false;
    const root = await renderScreen();
    expect(root.root.findAllByType(Toggle)[TOGGLE.hallRanksShare].props.disabled).toBe(true);
    expect(texts(root)).toMatch(/[Tt]urn on sync above to share/);
  });

  // Rework of #305's review: toggleShared reverts (doesn't flip the UI) and shows an alert when
  // syncSharedStat fails -- toggleHallSync's own syncSharedStat(hall_ranks, null) call only logged
  // a warning and flipped SYNC off locally regardless, claiming success even though the server-side
  // SHARE clear actually failed. Same honest treatment as toggleShared: don't optimistically flip
  // SYNC off, and surface the failure.
  it("does not flip SYNC off and shows an error when the hall_ranks SHARE clear fails", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockTables({ sharedStatsRow: { completion: null, top_foods: null, hall_ranks: [{ hallTid: 1, rank: 1 }] } });
    mockSyncSharedStat.mockResolvedValue({ error: { message: "network down" } });
    const root = await renderScreen();

    await act(async () => {
      root.root.findAllByType(Toggle)[TOGGLE.hallSync].props.onValueChange(false);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(root.root.findAllByType(Toggle)[TOGGLE.hallSync].props.value).toBe(true); // not flipped off
    expect(root.root.findAllByType(Toggle)[TOGGLE.hallRanksShare].props.value).toBe(true); // hall_ranks not cleared locally
    expect(mockSetHallSyncEnabled).not.toHaveBeenCalledWith(false);
    expect(Alert.alert).toHaveBeenCalledWith(expect.any(String), expect.any(String));
  });

  it("does not delete favorite_dining_halls when SYNC is already on and some other toggle changes", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();
    mockFrom.mockClear();

    await act(async () => {
      root.root.findAllByType(Toggle)[TOGGLE.findable].props.onValueChange(false);
      await Promise.resolve();
    });

    expect(mockFrom).not.toHaveBeenCalledWith("favorite_dining_halls");
  });
});

describe("PrivacyScreen: Findable by search toggle (#285)", () => {
  it("renders profiles.discoverable and writes it back on toggle", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockTables({ discoverable: true });
    const root = await renderScreen();
    const findableToggle = root.root.findAllByType(Toggle)[TOGGLE.findable];
    expect(findableToggle.props.value).toBe(true);

    await act(async () => {
      findableToggle.props.onValueChange(false);
      await Promise.resolve();
    });

    expect(root.root.findAllByType(Toggle)[TOGGLE.findable].props.value).toBe(false);
  });

  it("shows a message and does not flip the toggle when the write fails", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockTables({ discoverable: true, profilesUpdateError: { message: "denied" } });
    const root = await renderScreen();

    await act(async () => {
      root.root.findAllByType(Toggle)[TOGGLE.findable].props.onValueChange(false);
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith("Couldn't update this setting", expect.any(String));
    expect(root.root.findAllByType(Toggle)[TOGGLE.findable].props.value).toBe(true);
  });
});

describe("PrivacyScreen: no delete-server-data path (#285)", () => {
  it("never renders a 'Delete server data' row or destructive action", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();
    expect(texts(root)).not.toMatch(/Delete server data/);
    expect(texts(root)).toMatch(/Also on the server/); // footnote for pings/sighting history, not a delete button
  });
});
