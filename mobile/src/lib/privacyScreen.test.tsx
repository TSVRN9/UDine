// First render coverage for the privacy toggles screen -- part of closing the "screens under
// mobile/src/app/ have zero render tests" gap the #126 review named (the same gap let findings
// #2/#4/#5 in friend/[id].tsx through).
//
// Lives here, not next to src/app/privacy.tsx: expo-router scans every file under src/app/ as a
// candidate route (see redirect.test.tsx's own note -- a .test.tsx there gets bundled into the
// real app and crashes at runtime on the bare `jest` global). Imports the screen by relative path
// instead, same pattern as redirect.test.tsx/hallMenu.test.tsx.

const mockSyncSharedStat = jest.fn().mockResolvedValue({ error: null });
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  syncSharedStat: (...args: unknown[]) => mockSyncSharedStat(...args),
}));

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

/** Same filtering chain-stub as friendProfileScreen.test.tsx -- applies `.eq()` against a fixed row so the
 * mock reflects what a real `.eq("user_id", me)` query would actually return. */
function table(rows: Record<string, unknown>[]) {
  let filtered = rows;
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (col: string, val: unknown) => {
    filtered = filtered.filter((r) => r[col] === val);
    return builder;
  };
  builder.maybeSingle = () => Promise.resolve({ data: filtered[0] ?? null, error: null });
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

jest.mock("expo-router", () => ({ useFocusEffect: (callback: () => void) => callback() }));

import renderer, { act } from "react-test-renderer";
import { Switch, Text } from "react-native";
import { supabase } from "./supabase";
import PrivacyScreen from "../app/privacy";

function session(userId: string) {
  return { data: { session: { user: { id: userId, email: `${userId}@umass.edu` } } } };
}

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children))).join(" | ");
}

/** `sharedStatsRow` is memoized once, same reason as friendProfileScreen.test.tsx's `mockTables`: a fresh
 * object literal per `mockFrom("shared_stats")` call would defeat React's Object.is bailout and
 * spin `useFocusEffect`'s every-render mock into an infinite loop. */
function mockRow(row: { completion: unknown; top_foods: unknown; hall_ranks: unknown } | null) {
  const fixture = row ? { user_id: "me", ...row } : null;
  mockFrom.mockImplementation((name: string) => {
    if (name === "shared_stats") return table(fixture ? [fixture] : []);
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

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncSharedStat.mockResolvedValue({ error: null });
});

describe("PrivacyScreen", () => {
  it("signed out: shows the sign-in value prop, not the toggles", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockRow(null);
    const root = await renderScreen();
    expect(texts(root)).toMatch(/Sign in required/);
    expect(root.root.findAllByType(Switch)).toHaveLength(0);
  });

  it("signed in: each toggle reflects presence/absence of its own column, independently", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockRow({ completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: null, hall_ranks: null });
    const root = await renderScreen();
    const switches = root.root.findAllByType(Switch);
    expect(switches).toHaveLength(3);
    // TOGGLES order: completion, top_foods, hall_ranks.
    expect(switches.map((s) => s.props.value)).toEqual([true, false, false]);
  });

  it("toggling a field ON pushes that field's freshly derived value, not another field's", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockRow({ completion: null, top_foods: null, hall_ranks: null });
    const root = await renderScreen();
    const topFoodsSwitch = root.root.findAllByType(Switch)[1];

    await act(async () => {
      topFoodsSwitch.props.onValueChange(true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSyncSharedStat).toHaveBeenCalledWith(expect.anything(), "me", "top_foods", []);
  });

  it("toggling a field OFF pushes null -- a revoke, not a no-op", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue(session("me"));
    mockRow({ completion: [{ hallTid: 1, loggedDistinct: 3, seenDistinct: 10 }], top_foods: null, hall_ranks: null });
    const root = await renderScreen();
    const completionSwitch = root.root.findAllByType(Switch)[0];

    await act(async () => {
      completionSwitch.props.onValueChange(false);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSyncSharedStat).toHaveBeenCalledWith(expect.anything(), "me", "completion", null);
  });
});
