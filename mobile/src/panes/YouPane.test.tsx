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
import fs from "node:fs";
import path from "node:path";
import renderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Favorite, LogEntry, RankedDish, RankedFood } from "@udine/shared";
import { YouPane } from "./YouPane";
import { colors, fonts } from "../lib/theme";
import { CompareSheet } from "../components/CompareSheet";
import { Toast } from "../components/Toast";
import { artboardEnclosingStyle, artboardStyle, artboardTag, normalizeColor } from "../lib/artboard";
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
  const saveRankedDishes = jest.fn().mockResolvedValue(undefined);
  const saveRankedFoods = jest.fn().mockResolvedValue(undefined);
  return { SqliteRankingStorage: jest.fn().mockImplementation(() => ({ getRankedDishes, getRankedFoods, saveRankedDishes, saveRankedFoods })) };
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
  useLocalSearchParams: jest.fn(() => ({})),
  router: { push: jest.fn() },
}));

const logMock = new SqliteLogStorage() as unknown as { getAllEntries: jest.Mock; removeEntry: jest.Mock };
const rankingMock = new SqliteRankingStorage() as unknown as { getRankedDishes: jest.Mock; getRankedFoods: jest.Mock; saveRankedDishes: jest.Mock; saveRankedFoods: jest.Mock };
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
    expect(body).not.toMatch(/Dish ranking is on hold for now/);
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

  // late-night-2am-day-rollover task 4: an entry logged at 12:30 AM has a raw calendar-day prefix
  // of the NEXT day, but under the ~2 AM rollover it's still "today" (mocked to 2026-08-19) --
  // it must not be filtered out as if it belonged to a different day.
  it("includes an entry logged at 12:30 AM (raw next-day prefix) in Today's Log, under the ~2 AM rollover", async () => {
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "Midnight Snack", 2, "2026-08-20T00:30:00.000")]);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Midnight Snack/);
    expect(body).not.toMatch(/Nothing logged yet/);
    expect(body).toMatch(/\b500\b/);
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

describe("YouPane Notifications section", () => {
  it("shows the empty state when there are no favorites yet", async () => {
    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Notifications/);
    expect(body).toMatch(/No notifications yet/);
    expect(body).not.toMatch(/Star a dish or dining hall to add one\./);
  });

  it("renders real favorites by name, dish or hall alike", async () => {
    const favs: Favorite[] = [
      { type: "dish", dishName: "Chicken Parm" },
      { type: "location", hallTid: 1 }, // Worcester
    ];
    favoritesMock.getFavorites.mockResolvedValue(favs);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Chicken Parm/);
    expect(body).toMatch(/Worcester/);
  });

  it("renders the SEE ALL link, and tapping it navigates to /favorites", async () => {
    favoritesMock.getFavorites.mockResolvedValue([{ type: "dish", dishName: "Chicken Parm" }]);

    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/SEE ALL/);

    // Two SEE-ALL-style links now exist (ALL LOGS, Notifications' SEE ALL) -- disambiguate by the
    // explicit accessibilityLabel (PR #129's explicit-labeling convention, same as EventsPane's
    // own SeeAllLink), not a fragile "first match" index-pick over every onPress handler.
    const seeAllPressable = root.root.findByProps({ accessibilityLabel: "See all notifications" });
    seeAllPressable.props.onPress();
    expect(mockRouterPush).toHaveBeenCalledWith("/favorites");
  });
});

// #419: YouPaneGrouped.dc.html:80-81 specs SEE ALL at 10px text/10px chevron, distinct from ALL
// LOGS' 11px/12px -- YouPane.tsx used to reuse allLogsText/allLogsChevron for both, so SEE ALL
// rendered oversized.
describe("YouPane SEE ALL sizing (#419)", () => {
  it("renders SEE ALL's text and chevron smaller than ALL LOGS'", async () => {
    favoritesMock.getFavorites.mockResolvedValue([{ type: "dish", dishName: "Chicken Parm" }]);
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "French Toast", 3, "2026-08-19T07:00:00.000")]);

    const root = await renderYouPane();

    const allLogsPressable = root.root.findAll((node) => typeof node.props.onPress === "function" && textsOf(node).includes("ALL LOGS"))[0];
    const [allLogsTextNode, allLogsChevronNode] = allLogsPressable.findAllByType(Text);
    const allLogsTextStyle = flatStyle(allLogsTextNode.props.style);
    const allLogsChevronStyle = flatStyle(allLogsChevronNode.props.style);

    const seeAllPressable = root.root.findByProps({ accessibilityLabel: "See all notifications" });
    const [seeAllTextNode, seeAllChevronNode] = seeAllPressable.findAllByType(Text);
    const seeAllTextStyle = flatStyle(seeAllTextNode.props.style);
    const seeAllChevronStyle = flatStyle(seeAllChevronNode.props.style);

    const spec = artboardStyle("YouPaneGrouped.dc.html", "SEE ALL");
    expect(seeAllTextStyle.fontSize).toBe(spec.fontSize);
    expect(seeAllChevronStyle.fontSize).toBe(spec.fontSize);
    expect(seeAllTextStyle.fontSize).toBeLessThan(allLogsTextStyle.fontSize as number);
    expect(seeAllChevronStyle.fontSize).toBeLessThan(allLogsChevronStyle.fontSize as number);
  });
});

describe("YouPane Your Food grouping", () => {
  it("groups Notifications, Your Top Foods, and Favorite Halls under one shared 'Your Food' heading, not just present somewhere on the pane", async () => {
    const root = await renderYouPane();

    const heading = root.root.findAllByType(Text).find((node) => node.props.children === "Your Food")!;
    // Walk up from the heading Text to the shared group container: Text -> groupHeader View ->
    // group View (see YouPane.tsx's JSX). A structural check, not a substring scan of the whole
    // pane -- a substring scan would still pass even if the wrapping <View style={group}> were
    // deleted and the heading left dangling with the three sections rendered as ordinary
    // (ungrouped) siblings elsewhere in the pane.
    let group = heading.parent!;
    while (group.parent && !textsOf(group).includes("Favorite Halls")) group = group.parent;
    const groupText = textsOf(group);
    expect(groupText).toMatch(/Notifications/);
    expect(groupText).toMatch(/Your Top Foods/);
    expect(groupText).toMatch(/Favorite Halls/);
    // Content that stays OUTSIDE the group (Today's Log/ALL LOGS, Hall Completion, both rendered
    // above it) must not leak into this subtree -- if `group` above resolved to some much broader
    // ancestor (e.g. because the wrapping View were removed), these would appear too and the
    // assertions above would pass without the grouping actually existing.
    expect(groupText).not.toMatch(/Today's Log/);
    expect(groupText).not.toMatch(/ALL LOGS/);
    expect(groupText).not.toMatch(/Hall Completion/);
  });
});

// #390: YouPane vs YouPaneGrouped.dc.html -- group title color/type were off-spec, and the
// bell-glyph disambiguation the you-food-group-note canvas annotation calls for (favoriting is a
// notify+highlight toggle, never a rating, and the Elo sections are read-only) was missing.
describe("YouPane group styling and disambiguation copy (#390)", () => {
  it("renders the 'Your Food' group title in the artboard's gold, 14px, 1.8 letter-spacing (not the old maroon/15px/1.5)", async () => {
    const root = await renderYouPane();
    const heading = root.root.findAllByType(Text).find((node) => node.props.children === "Your Food")!;
    const style = flatStyle(heading.props.style);
    const spec = artboardStyle("YouPaneGrouped.dc.html", "Your Food");
    expect(style.color).toBe(colors.gold500);
    expect(normalizeColor(style.color as string)).toBe(spec.color);
    expect(style.fontSize).toBe(spec.fontSize);
    expect(style.letterSpacing).toBe(spec.letterSpacing);
  });

  it("renders no explanatory hint line under Favorites/Your Top Foods/Favorite Halls -- the section titles and bell icon carry the meaning, no caption spells it out", async () => {
    favoritesMock.getFavorites.mockResolvedValue([{ type: "dish", dishName: "Chicken Parm" }]);
    const root = await renderYouPane();
    const body = texts(root);
    expect(body).not.toMatch(/Get notified \(and see it highlighted\) when spotted elsewhere on campus\./);
    expect(body).not.toMatch(/From your head-to-head comparisons only/);
    expect(body).not.toMatch(/Ranked by your dish comparisons at each hall/);
    // "Star a dish or dining hall to add one." is asserted absent in "shows the empty state when
    // there are no favorites yet" instead -- this test's favorites list is non-empty, so that
    // EmptyState branch never renders here and the check would be vacuous.
    expect(body).not.toMatch(/Dish ranking is on hold for now/);
  });

  it("renders favorite rows as just a bell icon + name -- no per-row caption spelling out the bell's meaning", async () => {
    const favs: Favorite[] = [
      { type: "dish", dishName: "Chicken Parm" },
      { type: "location", hallTid: 1 },
    ];
    favoritesMock.getFavorites.mockResolvedValue(favs);
    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/Chicken Parm/);
    // No caption text of any kind on the row itself -- the bell icon (asserted by the group-level
    // disambiguation-hint test above) is the whole disambiguation, not a per-row label restating it.
    expect(body).not.toMatch(/Dish alert/);
    expect(body).not.toMatch(/Hall alert/);
    const bareTypeTexts = root.root.findAllByType(Text).filter((n) => n.props.children === "Dish" || n.props.children === "Hall");
    expect(bareTypeTexts).toHaveLength(0);
  });
});

// #454: the export icon used to live in the shared PaneHeader as a conditionally-mounted flex
// sibling of the pane-position dots, which shifted the dots' on-screen position every time it
// mounted/unmounted. Moved into the You pane's own scroll content, following the same
// SectionHeader `right` + Press + allLogsLink-styled Text convention as goToAllLogs/goToFavorites.
describe("YouPane header export shortcut", () => {
  it("renders an EXPORT link, and tapping it navigates to /export", async () => {
    const root = await renderYouPane();
    const body = texts(root);
    expect(body).toMatch(/EXPORT/);

    const exportPressable = root.root.findAll((node) => typeof node.props.onPress === "function" && textsOf(node).includes("EXPORT"))[0];
    exportPressable.props.onPress();
    expect(mockRouterPush).toHaveBeenCalledWith("/export");
  });
});

// --- Head-to-head entry points (YouTopFoodsRankMore.dc.html / YouTopFoodsEmpty.dc.html) ----------
// Logged on an earlier day (not today), so Today's Log stays out of the way. French Toast and
// Belgian Waffle share a hall, so one pick rates two dishes at it and the hall ranks.
const LOGGED_AT = "2026-08-01T12:00:00.000";
const frenchToast = () => logEntry("1", "French Toast", 3, LOGGED_AT);
const waffle = () => logEntry("2", "Belgian Waffle", 3, LOGGED_AT);
const soup = () => logEntry("3", "Soup", 2, LOGGED_AT);

/** A ranking store that remembers what was saved, so the pane's refresh after a pick reads the new order. */
function statefulRanking(dishes: RankedDish[] = [], foods: RankedFood[] = []) {
  const state = { dishes, foods };
  rankingMock.getRankedDishes.mockImplementation(async () => state.dishes);
  rankingMock.getRankedFoods.mockImplementation(async () => state.foods);
  rankingMock.saveRankedDishes.mockReset().mockImplementation(async (d: RankedDish[]) => {
    state.dishes = d;
  });
  rankingMock.saveRankedFoods.mockReset().mockImplementation(async (f: RankedFood[]) => {
    state.foods = f;
  });
  return state;
}

// One comparison short of scoreOutOfTen's gate of 3.
const atTwo = (dishName: string): RankedFood => ({ dishName, rating: 1500, comparisonCount: 2 });

async function tap(root: renderer.ReactTestRenderer, text: string) {
  const node = root.root.findAll((n) => typeof n.props.onPress === "function" && textsOf(n).includes(text))[0];
  await act(async () => {
    node.props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
  });
}
const sheetProps = (root: renderer.ReactTestRenderer) => root.root.findByType(CompareSheet).props;
const shownNames = (root: renderer.ReactTestRenderer) => (sheetProps(root).pair as { dishName: string }[]).map((c) => c.dishName).sort();
const hasRankMore = (root: renderer.ReactTestRenderer) => /RANK MORE/.test(texts(root));
const toasts = (root: renderer.ReactTestRenderer) => root.root.findAllByType(Toast);

describe("YouPane head-to-head entry points", () => {
  beforeEach(() => {
    statefulRanking();
  });

  it("with fewer than two distinct logged dishes: no Rank more, no Start comparing, no sheet", async () => {
    logMock.getAllEntries.mockResolvedValue([frenchToast(), frenchToast()]); // one dish, logged twice
    statefulRanking([], [atTwo("French Toast")]);
    const oneDish = await renderYouPane();
    expect(hasRankMore(oneDish)).toBe(false);
    expect(texts(oneDish)).not.toMatch(/Start comparing/);
    expect(sheetProps(oneDish).visible).toBe(false);

    logMock.getAllEntries.mockResolvedValue([]);
    statefulRanking();
    const noDish = await renderYouPane();
    expect(texts(noDish)).toMatch(/No comparisons yet/);
    expect(texts(noDish)).not.toMatch(/Start comparing/);
    expect(hasRankMore(noDish)).toBe(false);
  });

  it("two dishes, no comparisons: 'Start comparing' + 'No comparisons yet' (no Rank more); tapping opens the sheet on those two dishes", async () => {
    logMock.getAllEntries.mockResolvedValue([frenchToast(), waffle()]);
    const root = await renderYouPane();
    expect(texts(root)).toMatch(/Start comparing/);
    expect(texts(root)).toMatch(/No comparisons yet/);
    expect(texts(root)).toMatch(/No ranking yet/);
    expect(hasRankMore(root)).toBe(false);
    expect(sheetProps(root).visible).toBe(false);

    await tap(root, "Start comparing");
    expect(sheetProps(root).visible).toBe(true);
    expect(shownNames(root)).toEqual(["Belgian Waffle", "French Toast"]);
  });

  it("two dishes, some comparisons: 'RANK MORE' replaces Start comparing and opens the same sheet", async () => {
    logMock.getAllEntries.mockResolvedValue([frenchToast(), waffle()]);
    statefulRanking([], [atTwo("French Toast"), atTwo("Belgian Waffle")]);
    const root = await renderYouPane();
    expect(hasRankMore(root)).toBe(true);
    expect(texts(root)).not.toMatch(/Start comparing/);
    await tap(root, "RANK MORE");
    expect(sheetProps(root).visible).toBe(true);
    expect(shownNames(root)).toEqual(["Belgian Waffle", "French Toast"]);
  });

  it.each([
    ["French Toast", "Belgian Waffle"],
    ["Belgian Waffle", "French Toast"],
  ])("picking %s over %s raises the winner on both Elo tracks, then Top Foods and Favorite Halls refresh in place", async (won, lost) => {
    logMock.getAllEntries.mockResolvedValue([frenchToast(), waffle()]);
    const state = statefulRanking([], [atTwo("French Toast"), atTwo("Belgian Waffle")]);
    const root = await renderYouPane();
    expect(texts(root)).toMatch(/Not enough data yet/);
    expect(texts(root)).toMatch(/No ranking yet/);

    await tap(root, "RANK MORE");
    await tap(root, won); // the card, not the Top Foods row: only the sheet's Pressable carries onPress + the name

    for (const track of [state.dishes, state.foods]) {
      const w = track.find((r) => r.dishName === won)!;
      const l = track.find((r) => r.dishName === lost)!;
      expect(w.rating).toBeGreaterThan(l.rating);
      expect(w.comparisonCount).toBe(track === state.foods ? 3 : 1);
    }
    expect(rankingMock.saveRankedDishes).toHaveBeenCalledTimes(1);
    expect(rankingMock.saveRankedFoods).toHaveBeenCalledTimes(1);
    // Refreshed without leaving the pane: both foods cleared the gate (winner ranked first), the hall ranks.
    const body = texts(root);
    expect(body).not.toMatch(/Not enough data yet/);
    expect(body).not.toMatch(/No ranking yet/);
    expect(body.indexOf(won)).toBeLessThan(body.indexOf(lost));
    expect(sheetProps(root).visible).toBe(false);
  });

  it("after a pick with no other pair to deal: the winner's toast has no 'Another', and Skip on the same null closes the sheet", async () => {
    logMock.getAllEntries.mockResolvedValue([frenchToast(), waffle()]);
    const root = await renderYouPane();
    await tap(root, "Start comparing");
    await tap(root, "Skip"); // the only pair is the one shown: nothing to deal, so the sheet closes
    expect(sheetProps(root).visible).toBe(false);
    expect(toasts(root)).toHaveLength(0);
    expect(rankingMock.saveRankedDishes).not.toHaveBeenCalled();

    await tap(root, "Start comparing");
    await tap(root, "French Toast");
    expect(toasts(root)).toHaveLength(1);
    expect(toasts(root)[0].props.message).toBe("French Toast");
    expect(toasts(root)[0].props.subline).toBe("1 comparison");
    expect(toasts(root)[0].props.action).toBeUndefined();
  });

  it("with a third dish, Skip deals another pair without recording, and a pick offers 'Another', which reopens the sheet on a fresh pair", async () => {
    logMock.getAllEntries.mockResolvedValue([frenchToast(), waffle(), soup()]);
    const root = await renderYouPane();
    await tap(root, "Start comparing");
    const first = shownNames(root);
    await tap(root, "Skip");
    expect(sheetProps(root).visible).toBe(true);
    expect(shownNames(root)).not.toEqual(first);
    expect(rankingMock.saveRankedDishes).not.toHaveBeenCalled();

    const shown = shownNames(root);
    await tap(root, shown[0]);
    expect(sheetProps(root).visible).toBe(false);
    const another = toasts(root)[0].props.action;
    expect(another.label).toBe("Another");
    await act(async () => {
      another.onPress();
    });
    expect(sheetProps(root).visible).toBe(true);
    expect(toasts(root)).toHaveLength(0);
    expect(shownNames(root)).not.toEqual(shown);
  });

  it.each([
    ["compare-seed", true],
    ["compare-seed-empty", false],
  ])("--stress %s runs on an in-memory store: the device's log and rankings are neither read nor written", async (stress, ranked) => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ stress });
    try {
      logMock.getAllEntries.mockClear();
      const root = await renderYouPane();
      expect(hasRankMore(root)).toBe(ranked);
      expect(/Start comparing/.test(texts(root))).toBe(!ranked);
      expect(texts(root)).toMatch(ranked ? /9\.1/ : /No comparisons yet/);
      await tap(root, ranked ? "RANK MORE" : "Start comparing");
      await tap(root, sheetProps(root).pair[0].dishName);
      expect(toasts(root)).toHaveLength(1);
      expect(logMock.getAllEntries).not.toHaveBeenCalled();
      expect(rankingMock.saveRankedDishes).not.toHaveBeenCalled();
      expect(rankingMock.saveRankedFoods).not.toHaveBeenCalled();
    } finally {
      (useLocalSearchParams as jest.Mock).mockReturnValue({});
    }
  });

  it("--stress applies when the deep link lands after the pane mounted", async () => {
    const root = await renderYouPane();
    expect(hasRankMore(root)).toBe(false);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ stress: "compare-seed" });
    try {
      await act(async () => {
        root.update(<YouPane />);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(hasRankMore(root)).toBe(true);
    } finally {
      (useLocalSearchParams as jest.Mock).mockReturnValue({});
    }
  });

  it("writes nothing off-device: no supabase or hall-rank sync anywhere in the pane", () => {
    const src = fs.readFileSync(path.join(__dirname, "YouPane.tsx"), "utf8");
    expect(src).not.toMatch(/syncDiningHallRanks|supabase/);
  });
});

describe("YouPane head-to-head artboard parity", () => {
  const RANK_MORE = "YouTopFoodsRankMore.dc.html";
  const EMPTY = "YouTopFoodsEmpty.dc.html";
  const c = (v: unknown) => normalizeColor(v as string);
  const minWidth = (anchor: string) => Number(/min-width:\s*(\d+)px/.exec(artboardTag(RANK_MORE, anchor).attrs.style)![1]);
  const GOLD_PILL = "background: #c99a2e; color: #3b0a0f; border-radius: 999px";
  const OUTLINED_PILL = "border: 1px solid rgba(36,26,20,0.2); color: #3b0a0f; border-radius: 999px";

  it("Rank more is SEE ALL's 10px/600 maroon action with a 10px chevron, per the artboard", async () => {
    logMock.getAllEntries.mockResolvedValue([frenchToast(), waffle()]);
    statefulRanking([], [atTwo("French Toast")]);
    const root = await renderYouPane();
    const press = root.root.findAll((n) => typeof n.props.onPress === "function" && textsOf(n).includes("RANK MORE"))[0];
    const [label, chevron] = press.findAllByType(Text);
    const spec = artboardStyle(RANK_MORE, "RANK MORE");
    const s = flatStyle(label.props.style);
    expect(s.fontSize).toBe(spec.fontSize);
    expect(s.letterSpacing).toBe(spec.letterSpacing);
    expect(c(s.color)).toBe(spec.color);
    expect(s.fontFamily).toBe(fonts.body600);
    expect(flatStyle(chevron.props.style).fontSize).toBe(Number(artboardTag(RANK_MORE, `width="10" height="10" viewBox="0 0 14 14"`).attrs.width));
    expect(flatStyle(press.props.style).gap).toBe(spec.gap);
  });

  it("populated rows: #1's pill is gold-filled, the rest outlined with the artboard's hairline; type and size match", async () => {
    logMock.getAllEntries.mockResolvedValue([frenchToast(), waffle()]);
    statefulRanking(
      [],
      [
        { dishName: "French Toast", rating: 1908, comparisonCount: 14 },
        { dishName: "Belgian Waffle", rating: 1870, comparisonCount: 9 },
      ],
    );
    const root = await renderYouPane();
    const subSpec = artboardStyle(RANK_MORE, "Hampshire · 14 comparisons");
    const sub = flatStyle(root.root.findAllByType(Text).find((t) => t.props.children === "Hampshire · 14 comparisons")!.props.style);
    expect(sub.fontSize).toBe(subSpec.fontSize);
    expect(c(sub.color)).toBe(subSpec.color);
    expect(root.root.findAllByType(Text).some((t) => t.props.children === "Hampshire · 9 comparisons")).toBe(true);
    const pill = (score: string) => root.root.findAll((n) => n.type === View && textsOf(n) === score && flatStyle(n.props.style).borderRadius !== undefined)[0];
    const gold = flatStyle(pill("9.1").props.style);
    const outlined = flatStyle(pill("8.7").props.style);
    const goldSpec = artboardStyle(RANK_MORE, "9.1");
    const outlinedSpec = artboardStyle(RANK_MORE, "8.7");
    expect(c(gold.backgroundColor)).toBe(goldSpec.backgroundColor);
    expect(gold.paddingVertical).toBe(goldSpec.paddingVertical);
    expect(outlined.paddingVertical).toBe(outlinedSpec.paddingVertical);
    expect(outlined.backgroundColor === undefined || outlined.backgroundColor === "transparent").toBe(true);
    expect(outlined.borderWidth).toBe(1);
    expect(c(outlined.borderColor)).toBe(outlinedSpec.borderColor);
    const outlinedText = flatStyle(pill("8.7").findByType(Text).props.style);
    expect(c(outlinedText.color)).toBe(outlinedSpec.color);
    expect(c(flatStyle(pill("9.1").findByType(Text).props.style).color)).toBe(goldSpec.color);
    expect(gold.minWidth).toBe(minWidth(GOLD_PILL));
    expect(outlined.minWidth).toBe(minWidth(OUTLINED_PILL));
  });

  it("Start comparing row: dashed maroon border, radius, padding, gap, min-height, and both lines of type", async () => {
    logMock.getAllEntries.mockResolvedValue([frenchToast(), waffle()]);
    const root = await renderYouPane();
    const row = root.root.findAll((n) => typeof n.props.onPress === "function" && textsOf(n).includes("Start comparing"))[0];
    const spec = artboardEnclosingStyle(EMPTY, "Start comparing", 2);
    const s = flatStyle(row.props.style);
    expect(s.borderStyle).toBe("dashed");
    expect(s.borderWidth).toBe(1);
    expect(c(s.borderColor)).toBe(spec.borderColor);
    expect(s.borderRadius).toBe(spec.borderRadius);
    expect(s.paddingVertical).toBe(spec.paddingVertical);
    expect(s.paddingHorizontal).toBe(spec.paddingHorizontal);
    expect(s.gap).toBe(spec.gap);
    expect(s.minHeight).toBe(44); // artboardStyle has no min-height mapping
    const title = flatStyle(root.root.findAllByType(Text).find((t) => t.props.children === "Start comparing")!.props.style);
    const titleSpec = artboardStyle(EMPTY, "Start comparing");
    expect(title.fontSize).toBe(titleSpec.fontSize);
    expect(c(title.color)).toBe(titleSpec.color);
    const sub = flatStyle(root.root.findAllByType(Text).find((t) => t.props.children === "No comparisons yet")!.props.style);
    const subSpec = artboardStyle(EMPTY, "No comparisons yet");
    expect(sub.fontSize).toBe(subSpec.fontSize);
    expect(c(sub.color)).toBe(subSpec.color);
  });

  it("Favorite Halls empty state is the artboard's plain card line", async () => {
    const root = await renderYouPane();
    const line = root.root.findAllByType(Text).find((t) => t.props.children === "No ranking yet")!;
    const spec = artboardStyle(EMPTY, "No ranking yet");
    expect(flatStyle(line.props.style).fontSize).toBe(spec.fontSize);
    expect(c(flatStyle(line.props.style).color)).toBe(spec.color);
    let node = line.parent!;
    while (node && flatStyle(node.props.style).paddingHorizontal === undefined) node = node.parent!;
    expect(flatStyle(node.props.style).paddingVertical).toBe(spec.paddingVertical);
    expect(flatStyle(node.props.style).paddingHorizontal).toBe(spec.paddingHorizontal);
  });
});
