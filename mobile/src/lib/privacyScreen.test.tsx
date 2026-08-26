// Lives here, not next to src/app/privacy.tsx: expo-router scans every file under src/app/ as a
// candidate route (see redirect.test.tsx's own note) -- imports the screen by relative path
// instead, same pattern as friendProfileScreen.test.tsx/notificationsScreen.test.tsx.
//
// #182 rewrite: this used to test the old 3-Switch privacy screen directly. The favorite-food-
// alerts toggle's own error-handling chain now lives in useFavoriteFoodAlerts (mutation-tested via
// notificationsScreen.test.tsx, which exercises the exact same hook through NotificationsBody) and
// deleteServerData's own partial-failure collection is unit-tested directly in
// deleteServerData.test.ts -- both are mocked here so this file only proves THIS screen's wiring
// (render the right toggle state, call the right function, revert + message on failure).

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
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  syncSharedStat: (...args: unknown[]) => mockSyncSharedStat(...args),
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

const mockDeleteServerData = jest.fn().mockResolvedValue({ ok: true, failedSteps: [] });
jest.mock("./deleteServerData", () => ({
  deleteServerData: (...args: unknown[]) => mockDeleteServerData(...args),
}));

// #272: confirmDelete must wait for whatever self-heal is registered here (bounded) before calling
// deleteServerData -- defaults to "nothing pending" so every test not about this race is unaffected.
const mockPendingSelfHeal = jest.fn<Promise<void> | null, []>(() => null);
jest.mock("./pendingSelfHeal", () => ({
  pendingSelfHeal: () => mockPendingSelfHeal(),
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
 * above) or else the fixed `singleRow` a test supplies; `.delete().eq()`/`.or()` resolve a
 * configurable `{ error }`; the plain select chain resolves `{ data: rows }`. */
function table(rows: Record<string, unknown>[], opts: { deleteError?: unknown; singleRow?: Record<string, unknown> | null; getSingleRow?: () => Record<string, unknown> | null } = {}) {
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

function mockTables(opts: { sharedStatsRow?: Record<string, unknown> | null; friendships?: Record<string, unknown>[]; deleteErrors?: Record<string, unknown> } = {}) {
  // Seeds the LIVE server-row stand-in (only when a test explicitly passes sharedStatsRow -- most
  // tests call mockTables() with no args just to (re)wire friendships, and must not stomp whatever
  // mockSyncSharedStat has already written this test).
  if (opts.sharedStatsRow !== undefined) mockSharedStatsServerRow = opts.sharedStatsRow as typeof mockSharedStatsServerRow;
  mockFrom.mockImplementation((name: string) => {
    if (name === "shared_stats") return table([], { getSingleRow: () => mockSharedStatsServerRow });
    if (name === "friendships") return table(opts.friendships ?? []);
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
  mockToggleAlerts.mockResolvedValue({ error: null });
  mockRefreshAlerts.mockResolvedValue(undefined);
  mockDeleteServerData.mockResolvedValue({ ok: true, failedSteps: [], undeletableSteps: [] });
  mockPendingSelfHeal.mockReturnValue(null);
  alertsState.notificationsEnabled = false;
  alertsState.favoritesCount = 0;
  alertsState.needsPermission = false;
  mockSharedStatsSeedState.seeded.clear();
  mockSharedStatsSeedState.disclosureDismissed.clear();
  mockLastFocusCallback = null;
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockTables();
});

afterEach(() => {
  alertSpy.mockRestore();
});

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

describe("PrivacyScreen: shared-with-friends toggles", () => {
  it("renders exactly the three real shared_stats toggles plus the alerts toggle -- not five", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();
    // 1 alerts toggle + 3 shared-stat toggles (completion, top_foods, hall_ranks) = 4, not 5.
    expect(root.root.findAllByType(Toggle)).toHaveLength(4);
    const body = texts(root);
    expect(body).toMatch(/Hall completion/);
    expect(body).toMatch(/Top foods/);
    expect(body).toMatch(/Favorite halls/);
    expect(body).not.toMatch(/Today's calories/);
    expect(body).not.toMatch(/Logging streak/);
  });

  it("each toggle reflects presence/absence of its own column, independently", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockTables({ sharedStatsRow: { completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: null, hall_ranks: null } });
    const root = await renderScreen();
    const toggles = root.root.findAllByType(Toggle);
    // index 0 is the alerts toggle; 1..3 are completion/top_foods/hall_ranks in that order.
    expect(toggles.map((t) => t.props.value)).toEqual([false, true, false, false]);
  });

  it("toggling a shared field ON pushes that field's freshly derived value, not another field's", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();
    const topFoodsToggle = root.root.findAllByType(Toggle)[2]; // alerts, completion, top_foods, hall_ranks

    await act(async () => {
      topFoodsToggle.props.onValueChange(true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSyncSharedStat).toHaveBeenCalledWith(expect.anything(), "me", "top_foods", []);
  });

  it("toggling a shared field OFF pushes null -- a revoke, not a no-op", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockTables({ sharedStatsRow: { completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: null, hall_ranks: null } });
    const root = await renderScreen();
    const completionToggle = root.root.findAllByType(Toggle)[1];

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
    const completionToggle = root.root.findAllByType(Toggle)[1];
    expect(completionToggle.props.value).toBe(false);

    await act(async () => {
      completionToggle.props.onValueChange(true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const after = root.root.findAllByType(Toggle)[1];
    expect(after.props.value).toBe(false); // reverted, not optimistically left on
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't update sharing", expect.any(String));
  });

  // #186: refresh()'s own re-push loop (fieldsNeedingRefresh -> syncSharedStat) can still be
  // mid-flight -- parked on an unrelated await -- when the user revokes a field via toggleShared.
  // Without the generationRef guard, the parked loop resumes afterward and re-pushes the field's
  // OLD (still-opted-in) value, resurrecting a stat the user just deleted server-side: directly
  // violating "switching off deletes it from the server immediately." Stages that interleaving
  // with a controllable friendships-query promise (refresh reads the friendships table AFTER
  // shared_stats but BEFORE its re-push loop, so parking it there reproduces "refresh has already
  // read the stale shared_stats row and is about to re-push it, but hasn't yet").
  it("#186: a toggle that revokes a field while refresh is mid-flight is not resurrected by refresh's stale re-push", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));

    let resolveFriendships!: (v: { data: unknown[] }) => void;
    const friendshipsPromise = new Promise<{ data: unknown[] }>((resolve) => {
      resolveFriendships = resolve;
    });
    mockFrom.mockImplementation((name: string) => {
      if (name === "shared_stats") return table([], { singleRow: { completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: null, hall_ranks: null } });
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
    const beforeToggle = root.root.findAllByType(Toggle)[1];
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
    // completion, top_foods, hall_ranks toggles all read ON afterward (index 0 is the alerts toggle).
    expect(root.root.findAllByType(Toggle).map((t) => t.props.value)).toEqual([false, true, true, true]);
    expect(mockSharedStatsSeedState.seeded.has("me")).toBe(true);
  });

  it("does not seed an existing (pre-ship-date) account, even though its row is also null", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me")); // default createdAt: 2020
    const root = await renderScreen();

    expect(sharedFieldPushes()).toEqual([]);
    expect(root.root.findAllByType(Toggle).map((t) => t.props.value)).toEqual([false, false, false, false]);
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
    expect(root.root.findAllByType(Toggle).map((t) => t.props.value)).toEqual([false, false, false, false]);
  });

  // The only reason the persisted (not just in-memory) marker exists: "Delete server data" deletes
  // the shared_stats row entirely (see deleteServerData.ts), so a re-focus afterward sees row ===
  // null again -- identical to a never-seeded new account. Without the marker surviving that delete,
  // this would resurrect exactly what the user just explicitly removed.
  it("does not re-seed after the row was deleted (Delete server data) -- the marker survives the delete", async () => {
    mockSharedStatsSeedState.seeded.add("me"); // simulates: this account was already seeded once
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    mockTables({ sharedStatsRow: null }); // simulates: shared_stats row is gone after deleteServerData
    const root = await renderScreen();

    expect(sharedFieldPushes()).toEqual([]);
    expect(root.root.findAllByType(Toggle).map((t) => t.props.value)).toEqual([false, false, false, false]);
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

  // PR #286 review, replaces the old (wrong) "a partial seed failure is not marked seeded, so the
  // next focus can retry" test: that test only asserted `seeded.has("me") === false` against a
  // STATIC mockTables fixture that never reflected what mockSyncSharedStat actually wrote, so it
  // passed for the wrong reason -- the real bug (traced by the reviewer) is that a field which
  // already pushed successfully before a LATER field fails is genuinely shared server-side, so the
  // marker (and the disclosure it gates) must be written on ANY success, not only a clean sweep.
  // Leaving the marker unwritten meant: (a) the disclosure never told the user their data was
  // already shared, and (b) the next focus's `row === null` gate (the row already exists after the
  // first successful push) blocked ever retrying the field that failed -- silently stuck forever
  // AND undisclosed. This test proves the fixed behavior directly, red against the old code (which
  // never wrote the marker/showed the disclosure on a partial success).
  it("a partial seed (one field succeeds, one fails) still marks the account seeded and discloses it -- and the failed field is never retried", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    mockSyncSharedStat.mockImplementationOnce(mockSyncSharedStatDefaultImpl).mockImplementationOnce(() => Promise.resolve({ error: { message: "network down" } }));
    const root = await renderScreen();

    // completion (pushed first, succeeded) reads ON; top_foods/hall_ranks (never got a turn once
    // top_foods failed and the loop broke) stay OFF. top_foods itself WAS attempted once, right here.
    expect(root.root.findAllByType(Toggle).map((t) => t.props.value)).toEqual([false, true, false, false]);
    expect(mockSyncSharedStat.mock.calls.map((c) => c[2])).toEqual(["completion", "top_foods"]);
    expect(mockSharedStatsSeedState.seeded.has("me")).toBe(true); // marked seeded on partial success, not just a full sweep
    expect(texts(root)).toMatch(/share with your accepted friends by default/i); // disclosure shows -- the user WAS shared without asking

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
  //
  // PR #286 review round 2: this does NOT mean the seed is never marked done. completion's push
  // above genuinely landed on the server (`error: null`) before the toggle's own race was even
  // detectable -- the account WAS defaulted into sharing it, however briefly, and that's the fact
  // the marker/disclosure record. Only the local `row` write for that field is skipped (the toggle's
  // own more-recent `null` already correctly shows OFF); the seed still credits itself and stops
  // pushing the remaining fields. (Reds against BOTH regressions this test guards, in order: (1)
  // reverting `seededNow = true` back below the post-await race check makes the final `seeded.has`
  // assertion fail (marked false when it should be true -- the exact bug this round fixed); (2)
  // removing the post-await `generationRef` check before `setRow` would clobber the toggle's `false`
  // back to the seed's stale ON value, failing the completion-toggle-reads-OFF assertion below.)
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
    const completionToggle = root.root.findAllByType(Toggle)[1];
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
    expect(root.root.findAllByType(Toggle)[1].props.value).toBe(false); // the toggle's own OFF wins locally
    expect(mockSharedStatsSeedState.seeded.has("me")).toBe(true); // but the seed's landed write still counts
  });

  // PR #286 review round 2's own motivating example: a toggle on a DIFFERENT field racing in DURING
  // field 1's own in-flight push must not erase credit for that push once it lands. Red against the
  // pre-fix ordering (race check before `seededNow = true`): the toggle races in WHILE completion's
  // push is still parked, so by the time it resolves the post-await check is already stale --
  // pre-fix, that made the loop `break` before ever setting `seededNow`, so `seeded.has` comes back
  // false and the disclosure never shows, even though completion's own write genuinely landed.
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

    // User manually toggles "Top foods" ON -- a DIFFERENT field than the one currently in flight --
    // while completion's push is still parked.
    const topFoodsToggle = root.root.findAllByType(Toggle)[2];
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

    expect(texts(root)).toMatch(/share with your accepted friends by default/i);
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
    expect(texts(root)).not.toMatch(/share with your accepted friends by default/i);
  });

  it("does not show the disclosure again once already dismissed in a previous session", async () => {
    mockSharedStatsSeedState.seeded.add("me");
    mockSharedStatsSeedState.disclosureDismissed.add("me");
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me", "me@umass.edu", NEW_ACCOUNT_CREATED_AT));
    mockTables({ sharedStatsRow: { completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: [], hall_ranks: [] } });
    const root = await renderScreen();

    expect(texts(root)).not.toMatch(/share with your accepted friends by default/i);
    // Already-seeded values still render normally -- dismissing the note doesn't touch the toggles.
    expect(root.root.findAllByType(Toggle)[1].props.value).toBe(true);
  });

  it("the footer no longer claims off-by-default", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();
    expect(texts(root)).toMatch(/Shared by default on new accounts/);
    expect(texts(root)).not.toMatch(/Off by default/);
  });
});

describe("PrivacyScreen: favorite-food alerts toggle", () => {
  it("renders the hook's current state and delegates the toggle to it", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    alertsState.notificationsEnabled = true;
    alertsState.favoritesCount = 3;
    const root = await renderScreen();
    expect(texts(root)).toMatch(/keeps your 3 favorites on the server to watch menus/);
    const alertsToggle = root.root.findAllByType(Toggle)[0];
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

    const alertsToggle = root.root.findAllByType(Toggle)[0];
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
    const alertsToggle = root.root.findAllByType(Toggle)[0];

    await act(async () => {
      await alertsToggle.props.onValueChange(true);
    });

    expect(Alert.alert).toHaveBeenCalledWith("Couldn't update notifications", expect.any(String));
  });
});

describe("PrivacyScreen: delete server data", () => {
  function pressDeleteRow(root: renderer.ReactTestRenderer) {
    const label = root.root.findAllByType(Text).find((n) => n.props.children === "Delete server data");
    let node = label!.parent;
    while (node && typeof node.props.onPress !== "function") node = node.parent;
    node!.props.onPress();
  }

  it("confirms before deleting, and calls deleteServerData with the signed-in user's id on confirm", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();

    pressDeleteRow(root);
    expect(Alert.alert).toHaveBeenCalledWith("Delete server data?", expect.any(String), expect.any(Array));
    expect(mockDeleteServerData).not.toHaveBeenCalled(); // not yet -- only on confirm

    const confirmButton = alertSpy.mock.calls[0][2].find((b: { text: string }) => b.text === "Delete");
    await act(async () => {
      await confirmButton.onPress();
    });

    expect(mockDeleteServerData).toHaveBeenCalledWith(expect.anything(), "me");
  });

  it("does not call deleteServerData at all if the row is never pressed", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    await renderScreen();
    expect(mockDeleteServerData).not.toHaveBeenCalled();
  });

  // Mutation-based red evidence: flip deleteServerData's mocked result to a genuinely retryable
  // failure (push_tokens has an owner DELETE policy + grant -- see deleteServerData.ts's own doc
  // comment -- so a failure there is a real, worth-retrying error, unlike profiles/food_sightings)
  // and this test's Alert.alert assertion is exactly what catches a screen that claims success
  // regardless of the result.
  it("shows a truthful partial-failure message for a genuinely retryable failure -- doesn't claim success", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockDeleteServerData.mockResolvedValue({ ok: false, failedSteps: ["push_tokens"], undeletableSteps: [] });
    const root = await renderScreen();

    pressDeleteRow(root);
    const confirmButton = alertSpy.mock.calls[0][2].find((b: { text: string }) => b.text === "Delete");
    await act(async () => {
      await confirmButton.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith("Couldn't delete everything", expect.stringContaining("push_tokens"));
  });

  // #237's actual bug: profiles (and food_sightings) have no owner DELETE policy/grant and are
  // denied on EVERY invocation -- deleteServerData.ts reports that in `undeletableSteps`, not
  // `failedSteps`, specifically so this path is reachable at all. Before the fix, the screen's own
  // `if (!result.ok)` check treated a profiles-only denial exactly like a real failure and showed
  // "Please try again" forever, with no success path ever reachable. Mutation-based red evidence:
  // reverting `result.failedSteps.length > 0` back to `!result.ok` (with `ok` computed the old,
  // pre-#237 way) turns this test red -- the retry copy would fire instead.
  it("clears local state and gives honest, non-retry copy when only the known-undeletable steps remain", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    // Seed non-empty local state (an opted-in shared stat + one accepted friendship) so clearing it
    // is actually observable, not vacuously true because it started empty.
    mockTables({ sharedStatsRow: { completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: null, hall_ranks: null }, friendships: [{ status: "accepted" }] });
    mockDeleteServerData.mockResolvedValue({ ok: true, failedSteps: [], undeletableSteps: ["profiles", "food_sightings", "qr_tokens"] });
    const root = await renderScreen();
    expect(root.root.findAllByType(Toggle)[1].props.value).toBe(true); // completion toggle on before delete
    expect(texts(root)).toMatch(/1 friend/);

    pressDeleteRow(root);
    const confirmButton = alertSpy.mock.calls[0][2].find((b: { text: string }) => b.text === "Delete");
    await act(async () => {
      await confirmButton.onPress();
    });

    // setRow(null) -- every shared-stat toggle reverts to off, not just the ones deleteServerData
    // happened to report.
    expect(root.root.findAllByType(Toggle).map((t) => t.props.value)).toEqual([false, false, false, false]);
    // setFriendships([]) -- the friend count in the profile summary line drops to 0.
    expect(texts(root)).toMatch(/0 friends/);
    // Never the retryable-failure copy -- profiles/food_sightings/qr_tokens will never succeed on retry.
    expect(Alert.alert).not.toHaveBeenCalledWith("Couldn't delete everything", expect.anything());
    expect(Alert.alert).toHaveBeenCalledWith("Server data deleted", expect.stringMatching(/profile.*food-sighting|food-sighting.*profile/i));
    // Finding 1/2 from the #246 review: the residue message must name qr_tokens and received pings
    // too, not just profiles/food_sightings, so it stays the actual exhaustive list of what's left.
    const successMessage = (Alert.alert as jest.Mock).mock.calls.find((c) => c[0] === "Server data deleted")[1];
    expect(successMessage).toMatch(/friend qr code/i);
    expect(successMessage).toMatch(/pings friends sent you/i);
  });

  // #272 part A, red-first: before this fix, confirmDelete never told the (mocked here) alerts hook
  // that server state changed, so the toggle kept reading its stale pre-delete value until the user
  // left and came back to this screen -- and, unmocked, the hook's own refresh() on that later
  // focus was what actually re-registered a push token (see favoriteFoodAlerts.test.tsx and
  // deleteServerData.test.ts for the rest of this fix). This test isolates just this screen's own
  // wiring: does confirmDelete call the hook's refresh() on a successful delete.
  it("#272: refreshes the alerts hook after a successful delete, so the toggle reads OFF without waiting for the next focus", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();

    pressDeleteRow(root);
    const confirmButton = alertSpy.mock.calls[0][2].find((b: { text: string }) => b.text === "Delete");
    await act(async () => {
      await confirmButton.onPress();
    });

    expect(mockRefreshAlerts).toHaveBeenCalled();
  });

  // #272 item B's delete-path mirror, red-first: on main, confirmDelete calls deleteServerData
  // immediately with no await on pendingSelfHeal() -- a self-heal register_push_token call already
  // in flight from this screen's own useFocusEffect refresh can land AFTER deleteServerData's
  // push_tokens delete, with a still-live session, resurrecting the row Delete just removed.
  it("#272: waits for an in-flight self-heal to settle before calling deleteServerData", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    let resolveHeal!: () => void;
    mockPendingSelfHeal.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveHeal = resolve;
      }),
    );
    const root = await renderScreen();

    pressDeleteRow(root);
    const confirmButton = alertSpy.mock.calls[0][2].find((b: { text: string }) => b.text === "Delete");
    let onPressPromise!: Promise<void>;
    await act(async () => {
      onPressPromise = confirmButton.onPress();
      await Promise.resolve();
    });

    // Blocked on the self-heal -- deleteServerData must not have run yet.
    expect(mockDeleteServerData).not.toHaveBeenCalled();

    await act(async () => {
      resolveHeal();
      await onPressPromise;
    });

    expect(mockDeleteServerData).toHaveBeenCalledWith(expect.anything(), "me");
  });

  it("#272: does NOT refresh the alerts hook when the delete has a genuinely retryable failure", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockDeleteServerData.mockResolvedValue({ ok: false, failedSteps: ["push_tokens"], undeletableSteps: [] });
    const root = await renderScreen();

    pressDeleteRow(root);
    const confirmButton = alertSpy.mock.calls[0][2].find((b: { text: string }) => b.text === "Delete");
    await act(async () => {
      await confirmButton.onPress();
    });

    expect(mockRefreshAlerts).not.toHaveBeenCalled();
  });

  // #253 item 1: a fully clean delete (once profiles/food_sightings/qr_tokens ever get DELETE
  // policies) must still tell the user something happened -- gating the success alert on
  // `undeletableSteps.length > 0` means the moment every step succeeds, the screen gives zero
  // feedback for a destructive action the user just confirmed.
  it("still shows a success alert when every step, including profiles/food_sightings/qr_tokens, actually succeeds", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockDeleteServerData.mockResolvedValue({ ok: true, failedSteps: [], undeletableSteps: [] });
    const root = await renderScreen();

    pressDeleteRow(root);
    const confirmButton = alertSpy.mock.calls[0][2].find((b: { text: string }) => b.text === "Delete");
    await act(async () => {
      await confirmButton.onPress();
    });

    // Confirm dialog + a real success alert.
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    expect(Alert.alert).toHaveBeenCalledWith("Server data deleted", expect.any(String));
    const successMessage = (Alert.alert as jest.Mock).mock.calls.find((c) => c[0] === "Server data deleted")[1];
    // Nothing stayed this time -- the residue clause (profile/food-sighting/etc) must not appear.
    expect(successMessage).not.toMatch(/stay/i);
  });

  it("the confirm dialog and the row's own subline both name what actually gets deleted, not the stale profile-inclusive claim", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    const root = await renderScreen();

    pressDeleteRow(root);
    const [, message] = alertSpy.mock.calls[0];
    expect(message).toMatch(/push tokens/);
    expect(message).toMatch(/sent pings/);
    expect(message).toMatch(/food-sighting history/);
    // Finding 1/2 from the #246 review: qr_tokens (undisclosed, unattempted before this) and
    // received pings (attempted-but-not-really-possible -- no receiver-delete policy exists) both
    // need to show up in the "stays" clause so it's the real exhaustive residue list.
    expect(message).toMatch(/friend qr code/i);
    expect(message).toMatch(/pings friends sent you/i);
    // #272: the copy must be honest that Delete also turns off alerts/discoverability, not just
    // that it removes rows -- deleteServerData's new "notifications" step does exactly this.
    expect(message).toMatch(/turns off favorite-food alerts/i);
    expect(message).toMatch(/discoverability/i);

    const body = texts(root);
    expect(body).toMatch(/push tokens/);
    expect(body).toMatch(/friend qr code/i);
    expect(body).toMatch(/turns off favorite-food alerts/i);
    // #253 item 3: rank.tsx re-syncs favorite_dining_halls unconditionally on the very next
    // comparison while signed in, so claiming the dining-hall removal is durable is misleading --
    // the copy must say it comes back the next time the user ranks.
    expect(message).toMatch(/dining halls synced for ping suggestions.*rank/i);
  });

  // #241: same hazard as #186's toggle test above, but for Delete instead of a toggle -- refresh()'s
  // re-push loop can be parked on the friendships await when the user confirms Delete. Without
  // confirmDelete also bumping generationRef, the parked loop resumes after deleteServerData wipes
  // shared_stats and re-pushes the field's stale (still-opted-in) value, resurrecting the row the
  // delete just removed even though the UI shows it as gone (setRow(null)).
  it("#241: a Delete confirm while refresh is mid-flight is not resurrected by refresh's stale re-push", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));

    let resolveFriendships!: (v: { data: unknown[] }) => void;
    const friendshipsPromise = new Promise<{ data: unknown[] }>((resolve) => {
      resolveFriendships = resolve;
    });
    mockFrom.mockImplementation((name: string) => {
      if (name === "shared_stats") return table([], { singleRow: { completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: null, hall_ranks: null } });
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
    // Flush enough microtasks for the session to resolve and refresh() to reach (and park on) the
    // friendships await -- shared_stats has already resolved by this point (setRow ran).
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const completionToggle = root.root.findAllByType(Toggle)[1];
    expect(completionToggle.props.value).toBe(true); // confirms refresh's shared_stats read landed

    // User confirms Delete while refresh is still parked on the friendships await.
    pressDeleteRow(root);
    const confirmButton = alertSpy.mock.calls[0][2].find((b: { text: string }) => b.text === "Delete");
    await act(async () => {
      await confirmButton.onPress();
      await Promise.resolve();
    });

    // Now let refresh's parked friendships await resolve -- its re-push loop sees `toRefresh` still
    // contains "completion" (captured from the row it read before the delete) and would, without
    // the guard, re-push a fresh non-null payload for it.
    await act(async () => {
      resolveFriendships({ data: [] });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const nonNullCompletionPushes = mockSyncSharedStat.mock.calls.filter((c) => c[2] === "completion" && c[3] !== null);
    expect(nonNullCompletionPushes).toHaveLength(0);
  });
});
