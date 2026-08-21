import type { ReactNode } from "react";

// Same rationale as FirstRunCard.test.tsx/index.test.tsx: explicit factories, not bare automocks --
// the real ../lib/supabase, ../lib/sqliteStorage, ../lib/rankingStorage, and ../lib/seenDishesStorage
// all drag in native bindings (Supabase client validation, expo-sqlite) unavailable outside
// jest-expo's native harness. Each storage's jest.fn()s are created *inside* its factory (not
// referenced from an outer `const mock... = jest.fn()`) -- YouPane.tsx instantiates each storage
// eagerly at module scope, and a factory that instead closed over an outer-scope mock var would
// capture it before it's initialized (Babel hoists the compiled `require` for YouPane's own imports
// above other top-level statements in this file -- see menuFetchWithSeenTracking.test.ts's comment
// on the same hazard). Below, a second `new SqliteLogStorage()` etc. (mirroring index.test.tsx's
// `firstRun as jest.Mocked<typeof firstRun>` pattern, adapted for a class) grabs the exact same
// jest.fn() references the factory closed over -- every mockImplementation() call returns a fresh
// wrapper object around the *same* fns, so this is the same mock YouPane.tsx's own singleton uses.
jest.mock("../lib/sqliteStorage", () => {
  const getAllEntries = jest.fn().mockResolvedValue([]);
  const removeEntry = jest.fn().mockResolvedValue(undefined);
  return { SqliteLogStorage: jest.fn().mockImplementation(() => ({ getAllEntries, removeEntry })) };
});

jest.mock("../lib/rankingStorage", () => {
  const getRankedDishes = jest.fn().mockResolvedValue([]);
  const getRankedFoods = jest.fn().mockResolvedValue([]);
  return { SqliteRankingStorage: jest.fn().mockImplementation(() => ({ getRankedDishes, getRankedFoods })) };
});

jest.mock("../lib/seenDishesStorage", () => {
  const getAllSeenDishNames = jest.fn().mockResolvedValue(new Map());
  return { SqliteSeenDishesStorage: jest.fn().mockImplementation(() => ({ getAllSeenDishNames })) };
});

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

jest.mock("../lib/auth", () => ({
  signInWithGoogle: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("../lib/date", () => ({ todayIso: () => "2026-08-19" }));

jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///cache/", writeAsStringAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn().mockResolvedValue(false), shareAsync: jest.fn() }));

// YouPane reads safe-area insets; there's no SafeAreaProvider in this render tree (same fix as
// hallMenu.test.tsx).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// YouPane always renders a Link (the Friends row) -- stub it flat since there's no navigator here.
// `router.push` is also stubbed (#118's ALL LOGS link). The jest.fn() is created *inside* the
// factory, not closed over from an outer-scope const -- same hazard as sqliteStorage/etc.'s mocks
// above (babel hoists jest.mock factories above other top-level statements); the test grabs the
// exact same fn reference back via `import { router } from "expo-router"` below, post-mock.
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  useFocusEffect: (callback: () => void) => callback(),
  router: { push: jest.fn() },
}));

import renderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import type { LogEntry, RankedDish, RankedFood } from "@udine/shared";
import { YouPane } from "./YouPane";
import { colors } from "../lib/theme";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { SqliteSeenDishesStorage } from "../lib/seenDishesStorage";

const logMock = new SqliteLogStorage() as unknown as { getAllEntries: jest.Mock; removeEntry: jest.Mock };
const rankingMock = new SqliteRankingStorage() as unknown as { getRankedDishes: jest.Mock; getRankedFoods: jest.Mock };
const seenMock = new SqliteSeenDishesStorage() as unknown as { getAllSeenDishNames: jest.Mock };
const mockWriteAsStringAsync = FileSystem.writeAsStringAsync as jest.Mock;
const mockRouterPush = router.push as jest.Mock;

function textsOf(instance: renderer.ReactTestInstance) {
  return instance.findAllByType(Text).map((n) => n.props.children).flat().join(" ");
}

function texts(root: renderer.ReactTestRenderer) {
  return textsOf(root.root);
}

// Merges a RN style prop (object, array, or nested array of either) into one plain object --
// enough to read a specific token (e.g. backgroundColor) back off a rendered node in a test.
function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return (style as Record<string, unknown>) ?? {};
}

// Button.tsx's own tests establish the convention: its Pressable is found via
// accessibilityRole="button" (findAllByType(Pressable) doesn't reliably match RN's Pressable
// export under jest-expo's renderer), not by type. Plain <Pressable> elements elsewhere in
// YouPane (sign-in/out, the Friends row) don't set this role, so it only matches Button-wrapped
// controls -- Export JSON/CSV and any per-entry Remove buttons.
function pressableWithText(root: renderer.ReactTestRenderer, label: string) {
  const match = root.root.findAllByProps({ accessibilityRole: "button" }).find((p) => textsOf(p) === label);
  if (!match) throw new Error(`No button found with text "${label}"`);
  return match;
}

async function renderYouPane() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<YouPane activeIndex={2} />);
  });
  // Flush the storage promises + resulting re-render (useFocusEffect fires synchronously above,
  // but the storage .then() callbacks still resolve on a microtask).
  await act(async () => {
    await Promise.resolve();
  });
  return root;
}

// Two dishes at the same hall (>= ranking.ts's MIN_RATED_DISHES_PER_HALL) so rankDiningHalls ranks it.
const rankedDishesForOneRankedHall: RankedDish[] = [
  { dishName: "A", hallTid: 1, rating: 1500, comparisonCount: 3 },
  { dishName: "B", hallTid: 1, rating: 1600, comparisonCount: 3 },
];

const NUTRITION = {
  servingSize: "1 serving",
  calories: 500,
  caloriesFromFat: 100,
  totalFatG: 11,
  satFatG: 3,
  transFatG: 0,
  cholesterolMg: 50,
  sodiumMg: 400,
  totalCarbG: 40,
  dietaryFiberG: 3,
  sugarsG: 5,
  proteinG: 30,
};

function logEntry(id: string, dishName: string, hallTid: number, loggedAt: string): LogEntry {
  return { id, loggedAt, source: { type: "umass-menu", dishName, hallTid }, servings: 1, nutrition: NUTRITION };
}

beforeEach(() => {
  logMock.getAllEntries.mockReset().mockResolvedValue([]);
  logMock.removeEntry.mockReset().mockResolvedValue(undefined);
  rankingMock.getRankedDishes.mockResolvedValue([]);
  rankingMock.getRankedFoods.mockResolvedValue([]);
  seenMock.getAllSeenDishNames.mockResolvedValue(new Map());
  mockWriteAsStringAsync.mockReset();
  mockRouterPush.mockReset();
});

describe("YouPane", () => {
  it("shows the fully-empty state: no log, no comparisons, no ranking", async () => {
    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Nothing logged yet/);
    expect(body).toMatch(/No comparisons yet/);
    expect(body).toMatch(/No ranking yet/);
  });

  it("shows the in-between state: halls ranked but no food has enough comparisons for a score yet (carry-over note 2)", async () => {
    rankingMock.getRankedDishes.mockResolvedValue(rankedDishesForOneRankedHall);
    const belowGate: RankedFood[] = [{ dishName: "Tofu Stir Fry", rating: 1550, comparisonCount: 1 }];
    rankingMock.getRankedFoods.mockResolvedValue(belowGate);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Almost there/);
    expect(body).not.toMatch(/No comparisons yet/);
    expect(body).not.toMatch(/No ranking yet/);
    expect(body).toMatch(/Worcester/); // hallTid 1
  });

  it("shows the populated state: today's log, a qualifying top food (real score, gold pill), and a favorite hall", async () => {
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "Chicken Parm", 1, "2026-08-19T12:00:00.000Z")]);
    rankingMock.getRankedDishes.mockResolvedValue(rankedDishesForOneRankedHall);
    // DEFAULT_RATING (ranking.ts) is 5.0's midpoint, 100 rating points per score point (scores.ts):
    // scoreOutOfTen(1650) = 5 + (1650-1500)/100 = 6.5 -- the single qualifying food, so also the top
    // score, so its pill must render gold (canvas: "gold for the top score, maroon otherwise").
    const qualifying: RankedFood[] = [{ dishName: "Chicken Parm", rating: 1650, comparisonCount: 5 }];
    rankingMock.getRankedFoods.mockResolvedValue(qualifying);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).not.toMatch(/Nothing logged yet/);
    expect(body).not.toMatch(/No comparisons yet/);
    expect(body).not.toMatch(/Almost there/);
    expect(body).not.toMatch(/No ranking yet/);
    expect(body).toMatch(/Chicken Parm/);
    expect(body).toMatch(/500/); // calorie total
    expect(body).toMatch(/6\.5/); // the actual score, not a placeholder/constant

    // The pill wiring itself: a gold-backgrounded pill must be the one showing 6.5, not some
    // other element coincidentally matching the regex above. (Several gold-filled Views exist now
    // — e.g. the top hall's completion bar fill — so scan them all for the score.)
    const goldViews = root.root.findAllByType(View).filter((v) => flatStyle(v.props.style).backgroundColor === colors.gold500);
    expect(goldViews.length).toBeGreaterThan(0);
    expect(goldViews.some((v) => /6\.5/.test(textsOf(v)))).toBe(true);
  });
});

describe("YouPane hall completion display", () => {
  it("floors a 199/200 completion to 99% -- pins that displayCompletionPct (not shared's half-up pct) feeds the label", async () => {
    // 200 distinct dishes seen at hall 1 (Worcester), 199 of them logged -- shared's own
    // hallCompletion.pct would round this to 100 (Math.round(99.5)); YouPane must floor instead.
    const allSeen = Array.from({ length: 200 }, (_, i) => `Dish ${i}`);
    seenMock.getAllSeenDishNames.mockResolvedValue(new Map([[1, allSeen]]));
    // Dated well before "today" (mocked to 2026-08-19) so these don't also populate TODAY'S LOG --
    // this test is only about the completion bar.
    logMock.getAllEntries.mockResolvedValue(allSeen.slice(0, 199).map((name, i) => logEntry(String(i), name, 1, "2026-08-01T12:00:00.000Z")));

    const root = await renderYouPane();
    const body = texts(root);
    // texts() joins each Text's children array with " " (the count Text's children are
    // [99, "%", " · ", 199, " of ", 200, " dishes"]), so allow join-inserted spacing.
    expect(body).toMatch(/199\s+of\s+200/);
    expect(body).toMatch(/99 ?%/);
    expect(body).not.toMatch(/100 ?%/);
  });
});

describe("YouPane export", () => {
  it("exports a freshly-read entry list, not a stale render's state (a just-removed entry must not leak in)", async () => {
    const stays = logEntry("stays", "Tofu Stir Fry", 1, "2026-08-01T12:00:00.000Z");
    const removed = logEntry("removed", "Chicken Parm", 1, "2026-08-01T12:00:00.000Z");
    logMock.getAllEntries.mockResolvedValue([stays, removed]);

    const root = await renderYouPane();
    // Simulate storage having already moved on (the entry was removed) without re-triggering
    // YouPane's own load()/re-render -- reproduces "component state hasn't caught up with storage
    // yet" without needing to race real timers.
    logMock.getAllEntries.mockResolvedValue([stays]);

    await act(async () => {
      pressableWithText(root, "Export JSON").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockWriteAsStringAsync).toHaveBeenCalledTimes(1);
    const [, content] = mockWriteAsStringAsync.mock.calls[0];
    expect(content).toMatch(/Tofu Stir Fry/);
    expect(content).not.toMatch(/Chicken Parm/);
  });
});

// --- #118: Today's Log grouped by mealtime, per-meal subtotals, ALL LOGS link. -----------------

describe("YouPane Today's Log meal grouping", () => {
  it("groups today's entries under meal headers with per-meal subtotals that sum to the day total", async () => {
    logMock.getAllEntries.mockResolvedValue([
      logEntry("1", "French Toast", 3, "2026-08-19T07:00:00.000"), // Hampshire, breakfast
      logEntry("2", "Grilled Chicken", 1, "2026-08-19T18:30:00.000"), // Worcester, dinner
    ]);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Breakfast/);
    expect(body).toMatch(/Dinner/);
    expect(body).not.toMatch(/Lunch/);
    expect(body).not.toMatch(/Late Night/);
    // Both entries are 500 cal (NUTRITION fixture) x 1 serving -- one per meal group, so each
    // group's subtotal is 500 and both entries' calories (500 total each group) show up.
    expect(body).toMatch(/500\s+cal/); // a per-meal group subtotal
    expect(body).toMatch(/French Toast · Hampshire/); // item line: name · hall, "× 1" omitted
    expect(body).toMatch(/Grilled Chicken · Worcester/);
  });

  it("shows the serving count in the item line when it isn't 1 (canvas format: \"<dish> × <qty> · <hall>\")", async () => {
    const twoServings: LogEntry = {
      id: "1",
      loggedAt: "2026-08-19T07:00:00.000",
      source: { type: "umass-menu", dishName: "French Toast", hallTid: 3 },
      servings: 2,
      nutrition: NUTRITION,
    };
    logMock.getAllEntries.mockResolvedValue([twoServings]);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/French Toast × 2 · Hampshire/);
  });

  it("renders the ALL LOGS link, and tapping it navigates to /logs without throwing", async () => {
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "French Toast", 3, "2026-08-19T07:00:00.000")]);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/ALL LOGS/);

    const allLogsPressable = root.root.findAll((node) => typeof node.props.onPress === "function" && textsOf(node).includes("ALL LOGS"))[0];
    expect(() => allLogsPressable.props.onPress()).not.toThrow();
    expect(mockRouterPush).toHaveBeenCalledWith("/logs");
  });
});
