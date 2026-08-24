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
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
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
import { supabase } from "../lib/supabase";
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
});
