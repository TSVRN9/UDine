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

const mockSyncSharedStat = jest.fn().mockResolvedValue({ error: null });
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  syncSharedStat: (...args: unknown[]) => mockSyncSharedStat(...args),
}));

const alertsState = { notificationsEnabled: false, favoritesCount: 0 };
const mockToggleAlerts = jest.fn().mockResolvedValue({ error: null });
jest.mock("./favoriteFoodAlerts", () => ({
  useFavoriteFoodAlerts: () => ({ session: null, ...alertsState, toggle: mockToggleAlerts }),
}));

const mockDeleteServerData = jest.fn().mockResolvedValue({ ok: true, failedSteps: [] });
jest.mock("./deleteServerData", () => ({
  deleteServerData: (...args: unknown[]) => mockDeleteServerData(...args),
}));

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
// privacy.tsx's refresh() always builds fresh objects (setCounts(deviceDataCounts(...)), a new
// friendships array, ...) -- calling useFocusEffect's callback unconditionally on every render
// never lets React's setState bail-out kick in and spins until Jest's test timeout. Same hazard/
// fix as friendsScreen.test.tsx/notificationsScreen.test.tsx: fire once per distinct callback
// identity (i.e. once per `[session]` dependency change).
const mockSeenFocusCallbacks = new WeakSet<() => void>();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args), back: (...args: unknown[]) => mockRouterBack(...args) },
  useFocusEffect: (callback: () => void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    callback();
  },
}));

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

/** Chainable query-builder stub, same shape as friendsScreen.test.tsx's `table()`. `.maybeSingle`
 * resolves the fixed single row a test supplies; `.delete().eq()`/`.or()` resolve a configurable
 * `{ error }`; the plain select chain resolves `{ data: rows }`. */
function table(rows: Record<string, unknown>[], opts: { deleteError?: unknown; singleRow?: Record<string, unknown> | null } = {}) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.or = chain;
  builder.maybeSingle = () => Promise.resolve({ data: opts.singleRow ?? null, error: null });
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

function session(userId: string, email = `${userId}@umass.edu`) {
  return { data: { session: { user: { id: userId, email } } } };
}

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children)))
    .join(" | ");
}

function mockTables(opts: { sharedStatsRow?: Record<string, unknown> | null; friendships?: Record<string, unknown>[]; deleteErrors?: Record<string, unknown> } = {}) {
  mockFrom.mockImplementation((name: string) => {
    if (name === "shared_stats") return table([], { singleRow: opts.sharedStatsRow ?? null });
    if (name === "friendships") return table(opts.friendships ?? []);
    throw new Error(`unexpected table ${name}`);
  });
}

async function renderScreen() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<PrivacyScreen />);
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
  mockSyncSharedStat.mockResolvedValue({ error: null });
  mockToggleAlerts.mockResolvedValue({ error: null });
  mockDeleteServerData.mockResolvedValue({ ok: true, failedSteps: [] });
  alertsState.notificationsEnabled = false;
  alertsState.favoritesCount = 0;
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

  // Mutation-based red evidence: flip deleteServerData's mocked result to `{ ok: false,
  // failedSteps: ["profiles"] }` and this test's Alert.alert assertion is exactly what catches a
  // screen that claims success regardless of the result (a real regression risk since the profiles
  // table has no owner DELETE policy -- see deleteServerData.ts's own doc comment).
  it("shows a truthful partial-failure message instead of claiming success", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockDeleteServerData.mockResolvedValue({ ok: false, failedSteps: ["profiles"] });
    const root = await renderScreen();

    pressDeleteRow(root);
    const confirmButton = alertSpy.mock.calls[0][2].find((b: { text: string }) => b.text === "Delete");
    await act(async () => {
      await confirmButton.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith("Couldn't delete everything", expect.stringContaining("profiles"));
  });
});
