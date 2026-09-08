// Explicit factories, not bare automocks -- the real ../lib/sqliteStorage, ../lib/rankingStorage,
// and ../lib/seenDishesStorage all drag in native bindings (expo-sqlite) unavailable outside
// jest-expo's native harness. Each storage's jest.fn()s are created *inside* its factory (not
// referenced from an outer `const mock... = jest.fn()`) -- YouPane.tsx instantiates each storage
// eagerly at module scope, and a factory that instead closed over an outer-scope mock var would
// capture it before it's initialized (Babel hoists the compiled `require` for YouPane's own imports
// above other top-level statements in this file -- see menuFetchWithSeenTracking.test.ts's comment
// on the same hazard). Below, a second `new SqliteLogStorage()` etc. grabs the exact same jest.fn()
// references the factory closed over -- every mockImplementation() call returns a fresh wrapper
// object around the *same* fns, so this is the same mock YouPane.tsx's own singleton uses.
import renderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { Favorite, LogEntry, RankedDish, RankedFood } from "@udine/shared";
import { YouPane } from "./YouPane";
import { colors } from "../lib/theme";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { SqliteSeenDishesStorage } from "../lib/seenDishesStorage";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { getCachedHours } from "../lib/menuHoursCache";
import { __resetRetailNamesForTest, recordRetailNames } from "../lib/retailHallNames";

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

// #90 nav reorg: the You pane's own Favorites section (real device data, not a stub) -- same
// mock shape favoritesStorage.ts's other call sites already use (e.g. hallMenu.test.tsx).
jest.mock("../lib/favoritesStorage", () => {
  const getFavorites = jest.fn().mockResolvedValue([]);
  const addFavorite = jest.fn().mockResolvedValue(undefined);
  const removeFavorite = jest.fn().mockResolvedValue(undefined);
  return { SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({ getFavorites, addFavorite, removeFavorite })) };
});

jest.mock("../lib/date", () => ({ todayIso: () => "2026-08-19" }));

// #243 bug A remaining gap: getCachedHours is cache-only/no-network (menuHoursCache.ts) -- mocked
// here so the race test below controls exactly when it resolves relative to YouPane's render,
// without pulling in expo-sqlite.
jest.mock("../lib/menuHoursCache", () => ({ getCachedHours: jest.fn().mockResolvedValue(null) }));

// YouPane reads safe-area insets; there's no SafeAreaProvider in this render tree (same fix as
// hallMenu.test.tsx).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// `router.push` is stubbed (#118's ALL LOGS link -- the only navigation YouPane does now that
// Account/Friends is cut). The jest.fn() is created *inside* the factory, not closed over from an
// outer-scope const -- same hazard as sqliteStorage/etc.'s mocks above (babel hoists jest.mock
// factories above other top-level statements); the test grabs the exact same fn reference back via
// `import { router } from "expo-router"` below, post-mock.
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => callback(),
  router: { push: jest.fn() },
}));

const logMock = new SqliteLogStorage() as unknown as { getAllEntries: jest.Mock; removeEntry: jest.Mock };
const rankingMock = new SqliteRankingStorage() as unknown as { getRankedDishes: jest.Mock; getRankedFoods: jest.Mock };
const seenMock = new SqliteSeenDishesStorage() as unknown as { getAllSeenDishNames: jest.Mock };
const favoritesMock = new SqliteFavoritesStorage() as unknown as { getFavorites: jest.Mock };
const mockRouterPush = router.push as jest.Mock;
const mockGetCachedHours = getCachedHours as jest.Mock;

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

async function renderYouPane() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<YouPane />);
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
  favoritesMock.getFavorites.mockReset().mockResolvedValue([]);
  mockRouterPush.mockReset();
  mockGetCachedHours.mockReset().mockResolvedValue(null);
  __resetRetailNamesForTest();
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
    expect(body).toMatch(/Not enough data yet/);
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
    expect(body).not.toMatch(/Not enough data yet/);
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

// --- #258: pin the today-filter -- an entry logged on a different day must not leak into
// Today's Log or its calorie total. `todayIso` is mocked to 2026-08-19 above.
describe("YouPane today-filter", () => {
  it("excludes entries logged on a different day from Today's Log and the calorie total", async () => {
    logMock.getAllEntries.mockResolvedValue([
      logEntry("1", "French Toast", 3, "2026-08-19T07:00:00.000"), // today
      logEntry("2", "Old Pizza", 1, "2026-08-18T18:30:00.000"), // yesterday -- must not show
    ]);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/French Toast/);
    expect(body).not.toMatch(/Old Pizza/);
    // NUTRITION fixture is 500 cal/serving -- if yesterday's entry leaked in, this would be 1000.
    expect(body).toMatch(/\b500\b/);
    expect(body).not.toMatch(/\b1000\b/);
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

  it("renders the ALL LOGS link, and tapping it navigates to /logs", async () => {
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "French Toast", 3, "2026-08-19T07:00:00.000")]);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/ALL LOGS/);

    const allLogsPressable = root.root.findAll((node) => typeof node.props.onPress === "function" && textsOf(node).includes("ALL LOGS"))[0];
    allLogsPressable.props.onPress();
    expect(mockRouterPush).toHaveBeenCalledWith("/logs");
  });

  it("ties the rendered Calories stat to the SUM OF RENDERED group subtotals (read off the actual output, not recomputed) with a fractional-calorie fixture", async () => {
    // Review finding on this PR: the 500/500 fixture can't discriminate a stat-card/group-subtotal
    // desync because a single-entry-per-group Math.round is the same whether you round once or
    // round-per-entry-then-sum. 50.5 cal entries force real rounding, and this test reads the
    // Calories stat and each meal-group header STRAIGHT OFF THE RENDER TREE (not by calling
    // groupEntriesByMeal again), so it fails if the two render seams (YouPane.tsx's `displayedCalories`
    // reduce vs. each group's own header) ever disagree -- which a pure-function test checking
    // groupEntriesByMeal against itself structurally cannot catch.
    const fractionalEntry = (id: string, loggedAt: string): LogEntry => ({
      id,
      loggedAt,
      source: { type: "umass-menu", dishName: id, hallTid: 1 },
      servings: 1,
      nutrition: { ...NUTRITION, calories: 50.5 },
    });
    logMock.getAllEntries.mockResolvedValue([
      fractionalEntry("a", "2026-08-19T07:00:00.000"), // breakfast
      fractionalEntry("b", "2026-08-19T18:00:00.000"), // dinner
    ]);

    const root = await renderYouPane();

    const subtotalTexts = root.root
      .findAllByType(Text)
      .map((n) => textsOf(n))
      .filter((t) => /^\d+\s+cal$/.test(t.trim()));
    expect(subtotalTexts.length).toBe(2); // one per meal group (breakfast, dinner)
    const renderedSubtotalSum = subtotalTexts.reduce((sum, t) => sum + Number(t.trim().replace(/\s+cal$/, "")), 0);

    const calorieStatMatch = /Calories (\d+)/.exec(texts(root));
    expect(calorieStatMatch).not.toBeNull();
    const renderedCalorieStat = Number(calorieStatMatch![1]);

    expect(renderedCalorieStat).toBe(renderedSubtotalSum);
    expect(renderedCalorieStat).toBe(102); // round(50.5) + round(50.5) = 51 + 51
  });
});

// --- #243 bug A remaining gap: PaneStack (mobile/src/components/PaneStack.tsx) keeps HomePane and
// YouPane permanently mounted -- YouPane's SQLite-backed log can render before HomePane's own
// network hours fetch has taught retailHallNames.ts's tid->name map a café's real name. This does
// NOT go through recordRetailNames directly (every other test in this repo that needs a retail
// name does that -- a reviewer flagged that pattern doesn't exercise the real ordering race), it
// goes through the same getCachedHours() seam HomePane itself falls back to, mocked above.
describe("YouPane cold-start retail-name race (#243 bug A)", () => {
  it("doesn't render a café log entry as the raw 'Hall <tid>' fallback once its cache-derived name is available, even though the SQLite log resolves first", async () => {
    // Café tid 32 (People's Organic Coffee) is in neither DINING_HALLS nor GRAB_N_GO_TIDS, so
    // hallOrRetailName falls back to "Hall 32" unless retailHallNames.ts has been taught its name.
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "Latte", 32, "2026-08-19T07:00:00.000")]);
    // getCachedHours resolves AFTER the render below starts -- simulates the SQLite log read
    // (near-instant) racing ahead of the cache read, same ordering #243 reports for the network case.
    // The mock replays getCachedHours' own real side effect (recordRetailNames on a cache hit,
    // menuHoursCache.ts) since the whole module is mocked out above and can't run its real body.
    let resolveCachedHours!: () => void;
    mockGetCachedHours.mockReturnValue(
      new Promise((resolve) => {
        resolveCachedHours = () => {
          recordRetailNames([{ name: "People's Organic Coffee", hours: null, locationId: 32 }]);
          resolve(null);
        };
      }),
    );

    const root = await renderYouPane();

    await act(async () => {
      resolveCachedHours();
      await Promise.resolve();
    });

    const body = texts(root);
    expect(body).toMatch(/Latte · People's Organic Coffee/);
    expect(body).not.toMatch(/Hall 32/);
  });
});

// --- #90 nav reorg: Favorites section (real SqliteFavoritesStorage data, not a stub), grouped
// with Top Foods/Favorite Halls under one "Your Food" heading. -------------------------------

describe("YouPane Favorites section", () => {
  it("shows the empty state when there are no favorites yet", async () => {
    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Favorites/);
    expect(body).toMatch(/No favorites yet/);
  });

  it("renders real favorites with the same dish/hall badge favorites.tsx uses", async () => {
    const favs: Favorite[] = [
      { type: "dish", dishName: "Chicken Parm" },
      { type: "location", hallTid: 1 }, // Worcester
    ];
    favoritesMock.getFavorites.mockResolvedValue(favs);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Chicken Parm/);
    expect(body).toMatch(/Worcester/);
    expect(body).toMatch(/Dish/);
    expect(body).toMatch(/Hall/);
  });

  it("renders the SEE ALL link, and tapping it navigates to /favorites", async () => {
    favoritesMock.getFavorites.mockResolvedValue([{ type: "dish", dishName: "Chicken Parm" }]);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/SEE ALL/);

    // Two SEE-ALL-style links now exist (ALL LOGS, Favorites' SEE ALL) -- disambiguate by the
    // exact accessible text, same convention the existing ALL LOGS test uses.
    const seeAllPressable = root.root.findAll((node) => typeof node.props.onPress === "function" && textsOf(node).includes("SEE ALL"))[0];
    seeAllPressable.props.onPress();
    expect(mockRouterPush).toHaveBeenCalledWith("/favorites");
  });
});

describe("YouPane Your Food grouping", () => {
  it("groups Favorites, Your Top Foods, and Favorite Halls under one shared 'Your Food' heading", async () => {
    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Your Food/);
    expect(body).toMatch(/Favorites/);
    expect(body).toMatch(/Your Top Foods/);
    expect(body).toMatch(/Favorite Halls/);
  });
});

describe("YouPane header export shortcut", () => {
  it("renders no export button of its own -- the settings/export icon lives in the shared PaneHeader (see PaneHeader.test.tsx), not in the pane's own scroll content", async () => {
    const root = await renderYouPane();
    expect(root.root.findAllByProps({ accessibilityLabel: "Export data" })).toHaveLength(0);
  });
});
