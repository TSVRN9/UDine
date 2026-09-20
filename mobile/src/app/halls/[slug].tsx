import {
  computeDailyTotals,
  currentMealPeriod,
  DINING_HALLS,
  fetchEvents,
  favoriteKey,
  GRAB_N_GO_TIDS,
  menuItemMacroBadges,
  menuItemMatchesPreferences,
  normalizeStationName,
  parseRetailMenuHtml,
  type DiningEvent,
  type DiningHoursFeed,
  type Favorite,
  type FoodPreferences,
  type HallMealPeriod,
  type LogEntry,
  type MacroPreset,
  type MealPeriod,
  type MenuItem,
  type RetailLocationHours,
} from "@udine/shared";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
  type ViewToken,
} from "react-native";
import { createNativeWrapper } from "react-native-gesture-handler";
import Reanimated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { DishCardSkeleton, SkeletonBar, Spinner, StationHeaderSkeleton } from "../../components/Skeleton";
import { EmptyState, SectionHeader } from "../../components/ui";
import { CafePdfViewer } from "../../components/CafePdfViewer";
import { CafeSheet } from "../../components/CafeSheet";
import { FavoriteStar } from "../../components/FavoriteStar";
import { FilterSheet, itemMatchesStationAndPriceFilter, MACRO_PRESET_LABELS, type PriceBucket } from "../../components/FilterSheet";
import { HallInfoSheet } from "../../components/HallInfoSheet";
import { HoldSlideHost, type HoldSlideHostHandle } from "../../components/HoldSlideOverlay";
import { PlateAddControl } from "../../components/PlateAddControl";
import { AnimatedTabUnderline, MealTabPager } from "../../components/MealTabPager";
import { MenuErrorCard } from "../../components/MenuErrorCard";
import { CustomFoodForm } from "../../components/CustomFoodForm";
import { NutritionLabel } from "../../components/NutritionLabel";
import { PlateBar } from "../../components/PlateBar";
import { CompareSheet } from "../../components/CompareSheet";
import { Toast, type ToastKind } from "../../components/Toast";
import { PlateSheet } from "../../components/PlateSheet";
import { StationScrubber } from "../../components/StationScrubber";
import { durations, toastActionDwell, toastDwell } from "../../lib/motion";
import { topViewableSectionIndex } from "../../lib/hallMenuScrubber";
import { behindSheetA11yProps } from "../../lib/sheetAnimation";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../../lib/theme";
import { formatTime } from "../../lib/homeHero";
import {
  cafeMealTabLabel,
  deriveHallMealTabs,
  directionsUrl,
  formatDateStepperLabel,
  formatServingSummary,
  hallInfoGrabNGoWindow,
  hallInfoHoursRows,
  isBrunchLunch,
  isCurrentTabLoading,
  MEAL_TABS,
  plateSheetContextLabel,
  shouldAutoCorrectMealTab,
  stepDate,
  toggleExpandedKey,
} from "../../lib/hallMenuTabs";
import { deriveCafeMealTabs, pickCafeMenuHtml, resolveCafeMenuState, syntheticHallTidForName, type CafeMenuState, type StandingMenuEntry } from "../../lib/cafeMenu";
import { getCachedDishCatalog, refreshDishCatalogIfStale, type CachedDishCatalog } from "../../lib/dishCatalog";
import { grabSections, moveSectionToFront, sectionsForPeriod, type MenuSection } from "../../lib/hallMenuSections";
import { macroBadgeRowWidth, shouldTuckBadges } from "../../lib/hallMenuBadgeLayout";
import { MacroPresetGlyph } from "../../lib/macroBadgeGlyphs";
import { SqliteFavoritesStorage, useGuardedToggleFavorite } from "../../lib/favoritesStorage";
import { SqliteCustomFoodsStorage } from "../../lib/customFoodsStorage";
import { fetchMenuAndRecordSeen } from "../../lib/menuFetchWithSeenTracking";
import { fetchHoursAndCache, getCachedMenu, type CachedMenu } from "../../lib/menuHoursCache";
import { supabase } from "../../lib/supabase";
import {
  addOrIncrement,
  compositeCalorieRange,
  foldRecipeToPlateEntry,
  listBottomPadding,
  menuItemToPlateEntry,
  plateKeyFor,
  plateSearchResultDetail,
  plateSearchResultToPlateEntry,
  resolvePlateAndCustomFoodVisibility,
  setCount,
  stepCount,
  toLogEntries,
  totalItemCount,
  totalPlatePrice,
  useGuardedLogPlate,
  type CompositeRecipe,
  type PlateEntry,
  type PlateSearchResult,
} from "../../lib/plate";
import { CompositeDishComposer } from "../../components/CompositeDishComposer";
import { getCachedPreferences, getPreferences, setPreferences } from "../../lib/preferences";
import { formatServings, MIN_DRAG_SERVINGS } from "../../lib/servingsStepper";
import { effectiveToday, nowLocalIso } from "../../lib/date";
import { SqliteLogStorage } from "../../lib/sqliteStorage";
import { SqliteRankingStorage } from "../../lib/rankingStorage";
import { compareCard, compareFixture, comparisonSubLine, dealPair, pickPostLogPair, plateDishes, recordComparison, type CompareCard } from "../../lib/compare";

// react-native-gesture-handler doesn't export a gesture-aware SectionList (only ScrollView/
// FlatList wrap createNativeWrapper for you); a plain SectionList nested under MealTabPager's
// GestureDetector doesn't participate in RNGH's native touch arbitration, so its scroll can
// steal a touch mid-drag and cancel an in-progress pane swipe.
/** The dish rows' and section headers' `layout` transition -- or no transition at all while the
 * FilterSheet occludes the list. hall-menu-filter-overlap brief, task 5 (2026-09-18): the owner's
 * "blank gaps / header drawn over a card" screenshots reproduced on-device at 13/31 vegetarian
 * toggles and root-caused to this transition. A diet-tag toggle thins sections in place, so the
 * surviving headers/rows keep their React key, move, and animate -- entirely behind the opaque
 * FilterSheet Modal -- and Reanimated's Fabric layout-animation proxy then leaves some of them at
 * their PRE-filter frame when the 180ms animation ends while VirtualizedList is still committing
 * the reshape's follow-up renders: 0/20 with the transition removed, 9/20 with a scroll-to-top
 * reset instead (task 4's candidate), 8/20 with the builder hoisted to a constant, 6/20 with
 * removeClippedSubviews off, 1/20 with the animation slowed to 1500ms (outliving the commit storm).
 * The sheet is the only place a reshape can start while this screen is mounted (setPrefs has one
 * caller; station/price filters live in the same sheet) and the transition is invisible behind it
 * anyway, so cells pass no `layout` at all while it is open and get it back on Done. Passing
 * `undefined` removes the native config before the chip tap can reshape anything (the sheet opens
 * on a separate, earlier commit); expand/collapse -- the transition's visible job -- is untouched
 * (0/20 on-device).
 * ponytail: if a reshape ever starts while the sheet is closed (e.g. prefs synced in from another
 * screen while mounted), gate this on that path too, or drop the cell transition entirely. */
function cellLayoutTransition(listOccluded: boolean) {
  return listOccluded ? undefined : LinearTransition.duration(durations.rowLayout);
}

const GestureSectionList = createNativeWrapper(SectionList, {
  disallowInterruption: true,
  shouldCancelWhenOutside: false,
}) as unknown as typeof SectionList;

/** A hall-menu-screen subject: a real DINING_HALLS entry (`slug` present -- gets Grab 'N Go +
 * the fixed 4-tab MEAL_TABS + the "being served now" subtitle) or a café (`slug` absent, meal
 * tabs derived from whatever the fetched items actually carry, per deriveCafeMealTabs). */
export interface HallMenuSubject {
  /** Undefined ONLY for a café with no locationId at all (get_infov2 sometimes omits it, hours.ts's
   * mapInfoV2 degrades it to undefined rather than throwing) -- there's no tid to ever probe
   * fetchMenu with, so the ajax fetch effect below short-circuits straight to the waterfall's
   * standing/info tiers off `retailLoc` alone. Always defined for a real hall. */
  tid?: number;
  name: string;
  slug?: string;
  /** Café-only (café-screen unification): the RetailLocationHours row from get_infov2, resolved by
   * cafe/[name].tsx before this ever mounts -- feeds the waterfall's standing-menu-HTML fallback
   * tier (resolveCafeMenuState) and the info-only state's hours/address/payment content
   * (CafeSheet). Undefined for a real hall, which needs neither. */
  retailLoc?: RetailLocationHours;
}

const storage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();
const favoritesStorage = new SqliteFavoritesStorage();
const customFoodsStorage = new SqliteCustomFoodsStorage();

// Dish rows feed an in-memory "plate" (steppers) instead of a single-selection log bar, plus a
// full nutrition-label screen. Both the plate's expanded sheet and the label are RN <Modal>s
// rendered from this screen, not routed Stack.Screens -- MenuItem doesn't need to survive a
// round-trip through router search params (Expo Router params are strings only), and neither
// needs a back-stack entry of its own. Register in _layout.tsx only if that changes.

/** Tab selection: the 4 real meal periods, or the Grab 'N Go tab -- Grab isn't a `MealPeriod` on
 * this hall's own menu (its items fetch from a different tid, `GRAB_N_GO_TIDS`, and come back
 * tagged with ordinary breakfast/lunch/etc. mealPeriod values, never a distinct "grab" one -- see
 * the sections memo below), so it's a sibling of MealPeriod, not a member of it. */
type TabSelection = MealPeriod | "grab";

/** Dev-only layout stress fixtures (.claude/agents/pr-reviewer.md's UI check + mobile/scripts/
 * screenshot.sh's --stress flag) -- synthetic dishes shaped to exercise row layouts real menu
 * data may not contain on a given day. __DEV__-gated and opt-in only via the `stress` route param
 * -- never runs in production. One set per meal period, so they show up under whichever tab a
 * screenshot lands on.
 *  - Boundary: nutrition that clears every reachable macro-badge threshold (shared/src/types.ts's
 *    MACRO_PRESET_CHECKS) -- max reachable is 4, not 5: `menuItemMacroBadges` suppresses
 *    `high-fiber` whenever `high-protein` also qualifies (both do here), so toggling all 5 macro
 *    filters on this dish only ever shows 4 badges. The name's last wrapped line is calibrated
 *    (see its own comment below) to actually cross a real tuck/untuck boundary as badge count
 *    changes, unlike a name picked by eye -- docs/briefs/hall-menu-badge-tuck-fixture-gap.md.
 *  - Realistic: a ~40 char name (the length real dishes actually wrap at), comfortably tucked at
 *    every reachable badge count -- the ordinary case the owner's badge-on-a-wasted-3rd-line
 *    report describes, not a boundary test. */
function stressFixtureItems(hallTid: number, mealPeriod: MealPeriod): MenuItem[] {
  const base = {
    category: "Stress Test",
    mealPeriod,
    hallTid,
    date: new Date().toISOString().slice(0, 10),
    allergens: [],
    dietTags: [],
  };
  return [
    {
      ...base,
      // Last line is the single unbreakable word "HarvestMedleyDeluxeStack" -- can't share a line
      // with anything else, so its width is fixed regardless of badge count (see DishRow's own
      // "measurement isn't valid once the decision changes what's being measured" doc -- this
      // fixture deliberately sidesteps that by never reflowing).
      // Measured on-device 2026-09-17/18 (Agent_Emulator_Narrow, docs/agents/emulator-pool.md):
      // containerWidth=229dp, lastLineWidth=172.77dp. At MACRO_BADGE_SIZE=15/MACRO_BADGE_GAP=4/
      // NAME_BADGE_GAP=7 (this device's spacing() scale as of this measurement --
      // hallMenuBadgeLayout.test.ts's own comment has the full derivation), shouldTuckBadges'
      // per-count threshold (containerWidth - 2*NAME_BADGE_GAP - badgeRowWidth(n)) is 181dp at
      // n=2 badges and 162dp at n=3 badges. 172.77 sits 8.23dp under the n=2 threshold (tucks with
      // 2 macro filters on) and 10.77dp over the n=3 threshold (untucks with 3+ on) -- both
      // margins an order of magnitude past known cross-platform onTextLayout rounding drift (RN
      // #36572/#36675 is sub-1dp), so a small font-metric change can't flip which side this lands
      // on. Toggle any 2 macro filters this dish qualifies for (e.g. high-protein + low-sodium) to
      // see it tucked; add a 3rd (e.g. under-300-cal) to see it untuck.
      dishName: "Mediterranean Roasted Vegetable Harvest Bowl With HarvestMedleyDeluxeStack",
      nutrition: {
        servingSize: "1 stress fixture",
        calories: 200,
        caloriesFromFat: 9,
        totalFatG: 1,
        satFatG: 0,
        transFatG: 0,
        cholesterolMg: 0,
        sodiumMg: 100,
        totalCarbG: 30,
        dietaryFiberG: 8,
        sugarsG: 2,
        proteinG: 15,
      },
    },
    {
      ...base,
      dishName: "Grilled Lemon Herb Chicken Thighs with Rice",
      nutrition: {
        servingSize: "1 stress fixture",
        calories: 280,
        caloriesFromFat: 90,
        totalFatG: 10,
        satFatG: 3,
        transFatG: 0,
        cholesterolMg: 60,
        sodiumMg: 420,
        totalCarbG: 24,
        dietaryFiberG: 3,
        sugarsG: 1,
        proteinG: 22,
      },
    },
  ];
}

/**
 * Dev-only composite-dish fixture (screenshot.sh's `--stress composite`) -- which dishes are
 * composite and what their add-ins are has no real data source yet: no backend task in the
 * foodpro-menu-expansion brief populates a base-dish → add-in-dish relationship anywhere (task 1
 * seeds an unrelated always-available station catalog), so `compositeDishFor` below returns null
 * for every real menu item until a later task sources this from public.dishes or the feed itself.
 * This fixture exists purely so CompositeDishRowStates.dc.html/CompositeDishComposer.dc.html's
 * states are screenshot-verifiable -- numbers match the artboards exactly (260-440 cal / 10-15g
 * protein range; 320 cal / 14g protein for the edamame+carrot totals example).
 */
function compositeFixtureNutrition(calories: number, proteinG: number, totalCarbG: number, totalFatG: number): MenuItem["nutrition"] {
  return {
    servingSize: "1 stress fixture",
    calories,
    caloriesFromFat: Math.round(totalFatG * 9),
    totalFatG,
    satFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 50,
    totalCarbG,
    dietaryFiberG: 1,
    sugarsG: 1,
    proteinG,
  };
}

function compositeFixtureItems(hallTid: number, mealPeriod: MealPeriod): MenuItem[] {
  const base = { category: "Stress Test", mealPeriod, hallTid, date: new Date().toISOString().slice(0, 10), allergens: [], dietTags: [] };
  return [
    { ...base, dishName: "Teriyaki Noodle Bowl", nutrition: compositeFixtureNutrition(260, 10, 38, 6) },
    { ...base, dishName: "Edamame", nutrition: compositeFixtureNutrition(45, 4, 4, 1), dietTags: ["Vegan"] },
    { ...base, dishName: "Shredded Carrot", nutrition: compositeFixtureNutrition(15, 0, 3, 0) },
    { ...base, dishName: "Fried Shallots", nutrition: compositeFixtureNutrition(70, 1, 6, 4) },
    { ...base, dishName: "Sriracha Mayo", nutrition: compositeFixtureNutrition(50, 0, 1, 5) },
  ];
}

const COMPOSITE_FIXTURE_ADD_INS: Record<string, string[]> = {
  "Teriyaki Noodle Bowl": ["Edamame", "Shredded Carrot", "Fried Shallots", "Sriracha Mayo"],
};

/** Resolves a MenuItem to its composite base+add-ins, or null for an ordinary dish. `pool` is
 * searched by dish name + hall (never mealPeriod -- an add-in fixture item only exists on the same
 * period as its base, see compositeFixtureItems, but this stays a name lookup rather than assuming
 * that). See compositeFixtureItems's own doc for why this is fixture-only, not real-data-driven,
 * in this PR. */
function compositeDishFor(item: MenuItem, pool: MenuItem[]): { base: MenuItem; addIns: MenuItem[] } | null {
  // __DEV__-gated, same as every other stress fixture on this screen -- COMPOSITE_FIXTURE_ADD_INS
  // is dev-only sample data (see its own doc), never a real association a production build should
  // ever act on, even by the coincidence of a real feed someday serving a dish with one of these
  // exact names.
  if (!__DEV__) return null;
  const addInNames = COMPOSITE_FIXTURE_ADD_INS[item.dishName];
  if (!addInNames) return null;
  const addIns = addInNames
    .map((name) => pool.find((i) => i.dishName === name && i.hallTid === item.hallTid))
    .filter((i): i is MenuItem => i !== undefined);
  return addIns.length > 0 ? { base: item, addIns } : null;
}

/** Bag/takeout glyph for the Grab 'N Go tab (artboard spec: "bag icon, same muted ink as the
 * other inactive tabs"). A real react-native-svg icon, not a Unicode stand-in -- emoji is out per
 * CLAUDE.md. */
function GrabBagIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M7 9V6a5 5 0 0 1 10 0v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M5 9h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 9Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

/** menu-filters-macros: a filled circular badge with a hand-drawn per-preset glyph (shape source:
 * lib/macroBadgeGlyphs.tsx, shared with FilterSheet.tsx's chip icons), matching
 * docs/design/BadgeConcepts.dc.html's shipped badge icons -- one accent color per preset instead
 * of a single shared gold (owner bug report 2026-09-12). accessibilityLabel carries the full
 * preset name for anyone not just eyeballing the glyph. */
const MACRO_BADGE_COLORS: Record<MacroPreset, { glyph: string; circle: string }> = {
  "high-protein": { glyph: colors.macroProteinAccent, circle: withOpacity(colors.macroProteinAccent, 18) },
  "low-sodium": { glyph: colors.macroSodiumAccent, circle: withOpacity(colors.macroSodiumAccent, 18) },
  "under-300-cal": { glyph: colors.macroCalorieAccent, circle: withOpacity(colors.macroCalorieAccent, 18) },
  "high-fiber": { glyph: colors.macroFiberAccent, circle: withOpacity(colors.macroFiberAccent, 18) },
  "low-fat": { glyph: colors.macroFatAccent, circle: withOpacity(colors.macroFatAccent, 20) },
};

// Shipped glyph size (BadgeConcepts.dc.html) -- named so the hall-menu dish row's badge-tuck
// width math (macroBadgeRowWidth below) derives from the same value MacroBadgeIcon actually
// renders at, instead of a second, driftable literal.
const MACRO_BADGE_SIZE = 15;
// macroBadgeRow's own internal gap between badge icons (its style below) -- named for the same
// reason as MACRO_BADGE_SIZE.
const MACRO_BADGE_GAP = spacing(1);

/** Meal-tab shimmer widths (MenuLoading.dc.html) -- per label, not one fixed width, so the
 * loading tab row's proportions already read as Breakfast/Lunch/Dinner/Late before the real
 * text lands. */
const MEAL_TAB_SKELETON_WIDTH: Record<HallMealPeriod, number> = {
  breakfast: fs(58),
  lunch: fs(40),
  dinner: fs(46),
  latenight: fs(32),
};
// rowNameLine's own gap between the dish name and the badge row (its style below) -- reused as the
// tuck decision's required slack on both sides, and as the tucked overlay's name-to-badge offset,
// so a tucked badge sits the same distance from the text as an in-flow one does.
const NAME_BADGE_GAP = spacing(2);

function MacroBadgeIcon({ preset }: { preset: MacroPreset }) {
  const { glyph, circle } = MACRO_BADGE_COLORS[preset];
  return (
    <Svg width={MACRO_BADGE_SIZE} height={MACRO_BADGE_SIZE} viewBox="0 0 20 20" accessible accessibilityLabel={MACRO_PRESET_LABELS[preset]}>
      <Circle cx={10} cy={10} r={10} fill={circle} />
      <MacroPresetGlyph preset={preset} color={glyph} detailColor={circle} />
    </Svg>
  );
}

/** Filter-funnel glyph for the FilterSheet FAB -- same thin-stroke style as GrabBagIcon above. */
// Filter-lines glyph -- docs/design/MenuFAB_Active.dc.html:75, docs/design/MenuFAB_Inactive.dc.html:75
function FilterGlyphIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
      <Path d="M2.5 3.5h11M4.5 8h7M6.5 12.5h3" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

/** Magnifying-glass glyph for an unmatched standing-menu row -- same thin-stroke style as
 * GrabBagIcon/FilterGlyphIcon above. Replaces the plain `›` chevron those rows used to render,
 * which read no differently from a matched dish row's own affordance; this one signals
 * "tap to search," not "tap to add." */
function MagnifierIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" stroke={color} strokeWidth={2} />
      <Path d="M21 21l-4.35-4.35" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Note-box glyph for the standing-menu caveat banner (CafeMenuMixed.dc.html:29-32) -- same
 * thin-stroke style as the other small glyphs on this screen. */
function NoteIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Rect x={2} y={2} width={10} height={10} rx={2} stroke={color} strokeWidth={1.3} />
      <Path d="M7 4.5v3M7 9.2v.1" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}

/** A "standing" state's unmatched rows (parseRetailMenuHtml items with no catalog match) --
 * name+price only, no nutrition to show or plate/log directly. Tapping one opens the plate
 * sheet's search pre-filled with its own name (openUnmatchedItemSearch/PlateSheet's
 * `initialQuery`). Rendered as the meal pane's ListFooterComponent, not mixed into `sections` --
 * these aren't MenuItems, so they don't fit hallMenuSections.ts's per-station MenuSection shape.
 *
 * Dashed border + a magnifying-glass icon (not the add-icon a real row gets) + explicit
 * "Nutrition not found" text mark that this isn't a normal loggable dish -- these rows would
 * otherwise look identical to a matched one. */
function UnmatchedMenuBlock({ entries, onTapItem }: { entries: Extract<StandingMenuEntry, { matched: false }>[]; onTapItem: (name: string) => void }) {
  return (
    <View style={styles.unmatchedBlock}>
      <View style={styles.sectionHeaderWrap}>
        <SectionHeader title="Also On The Menu" />
      </View>
      {entries.map((entry, i) => (
        <Pressable
          key={`${entry.name}-${i}`}
          style={styles.unmatchedRow}
          onPress={() => onTapItem(entry.name)}
          accessibilityRole="button"
          // An explicit accessibilityLabel on a Pressable suppresses announcement of its own
          // child Text nodes on a screen reader, so "nutrition not found" needs to be folded in
          // here too.
          accessibilityLabel={`Search for ${entry.name}, nutrition not found`}
        >
          <View style={styles.unmatchedRowMain}>
            <Text style={styles.unmatchedRowName}>{entry.name}</Text>
            <Text style={styles.unmatchedRowMeta}>{entry.price ? `${entry.price} · ` : ""}nutrition not found</Text>
          </View>
          <View style={styles.unmatchedRowIcon}>
            <MagnifierIcon color={colors.maroon600} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** One dish row card. Split out of HallMenuScreenBody's old renderDishRow (a plain function
 * SectionList called, not a mounted component) into a real function component -- the badge-tuck
 * measurement below needs its own per-row useState, which only a mounted component can hold.
 * JSX/logic below is otherwise moved as-is from that old renderDishRow.
 *
 * Badge-tuck measurement: containerWidth (rowNameLine's own onLayout) and lastLine (the dish
 * name's onTextLayout) are two SEPARATE state slots, one per callback. RN fires onLayout and
 * onTextLayout in the same commit but their relative order isn't guaranteed, and onTextLayout does
 * NOT re-fire just because the other callback's state update triggers a re-render -- computing the
 * tuck decision inside either callback by reading the other's value from a closure risks
 * permanently reading a stale/zero value. Instead each callback only ever sets its own state, and
 * `tucked` below is recomputed fresh from both current state values on every render.
 */
function DishRow({
  item,
  plate,
  favoriteDishKeys,
  expandedKey,
  prefs,
  toggleExpanded,
  toggleDishFavorite,
  addToPlate,
  stepPlateItem,
  activeListRef,
  holdSlideHostRef,
  dragStateRef,
  liveHoldCount,
  liveHoldIndex,
  setLabelItem,
  composite,
  onOpenComposer,
  onReAddRecipe,
  listOccluded,
}: {
  item: MenuItem;
  plate: PlateEntry[];
  favoriteDishKeys: Set<string>;
  expandedKey: string | null;
  prefs: FoodPreferences;
  toggleExpanded: (key: string) => void;
  toggleDishFavorite: (dishName: string) => void;
  addToPlate: (item: MenuItem, count?: number) => void;
  stepPlateItem: (item: MenuItem, delta: number) => void;
  /** Whichever SectionList is ACTUALLY selected/touchable right now (see activeStationListRef's
   * own doc, [slug].tsx below) -- not a fixed meal/grab pair. A dish row only ever renders inside
   * one pane at a time, and only the active pane is ever touchable (MealTabPager's windowed
   * neighbors are pointerEvents-disabled), so this is the only ref HoldSlideAddButton's
   * blocksExternalGesture ever needs. */
  activeListRef: RefObject<any>;
  holdSlideHostRef: RefObject<HoldSlideHostHandle | null>;
  dragStateRef: RefObject<{ item: MenuItem } | null>;
  liveHoldCount: SharedValue<number>;
  liveHoldIndex: SharedValue<number>;
  setLabelItem: (item: MenuItem) => void;
  /** Non-null only for a composite (bowl composer) dish -- composite-dish-logic annotation. `null`
   * for every ordinary dish, which is the overwhelming majority of rows and keeps this a no-op for
   * them. `recipe` is this session's saved selection for THIS base dish, if any (null the first
   * time, before ever composing). */
  composite: { addIns: MenuItem[]; recipe: CompositeRecipe | null } | null;
  /** Opens the composer sheet -- from the not-yet-composed row's bowl button (initialRecipe null)
   * or the composed row's "Edit add-ins" link (initialRecipe the saved recipe). */
  onOpenComposer: (base: MenuItem, addIns: MenuItem[], initialRecipe: CompositeRecipe | null) => void;
  /** Tapping "+" after stepping a composed dish back to 0 -- re-adds the last-saved recipe
   * directly, no composer round-trip. */
  onReAddRecipe: (item: MenuItem) => void;
  /** True while the FilterSheet covers the list -- see cellLayoutTransition. */
  listOccluded: boolean;
}) {
  const dishKey = plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid });
  const plateEntry = plate.find((p) => p.key === dishKey);
  const isFavorite = favoriteDishKeys.has(favoriteKey({ type: "dish", dishName: item.dishName }));
  const expanded = expandedKey === dishKey;
  const macroBadges = menuItemMacroBadges(item, prefs);
  const showFiber = macroBadges.includes("high-fiber");
  // A composed row (composite + already on the plate) is the only state that ever reuses the
  // expand slot for "Edit add-ins" -- a not-yet-composed composite row expands like any ordinary
  // dish (diet tags + Full Nutrition Label), matching CompositeDishRowStates.dc.html's 3 states.
  const composedInPlate = composite && plateEntry ? composite : null;
  const calorieRange = composite && !plateEntry ? compositeCalorieRange(item, composite.addIns) : null;
  // The composed total (once on the plate) lives on the PlateEntry, not the base MenuItem --
  // item.nutrition never changes when a dish is composed, only the folded plate row does.
  const displayNutrition = composedInPlate ? plateEntry!.nutrition : item.nutrition;

  const [containerWidth, setContainerWidth] = useState(0);
  const [hasContainerWidth, setHasContainerWidth] = useState(false);
  const [lastLine, setLastLine] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [lineCount, setLineCount] = useState(1);
  const [hasTextLayout, setHasTextLayout] = useState(false);

  const handleNameContainerLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
    setHasContainerWidth(true);
  };
  const handleNameTextLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    const lines = e.nativeEvent.lines;
    setLastLine(lines.length > 0 ? lines[lines.length - 1] : null);
    setLineCount(lines.length);
    setHasTextLayout(true);
  };

  // Both measurements resolved -- not just one -- before ever trusting either. Fresh on every
  // render, off current state only (see this component's own doc above for why).
  const measured = hasContainerWidth && hasTextLayout;
  const badgeRowWidth = macroBadges.length > 0 ? macroBadgeRowWidth(macroBadges.length, MACRO_BADGE_SIZE, MACRO_BADGE_GAP) : 0;
  const tucked =
    measured &&
    lineCount > 1 &&
    lastLine !== null &&
    shouldTuckBadges({ containerWidth, lastLineWidth: lastLine.width, badgeRowWidth, gap: NAME_BADGE_GAP });

  const badgeIcons = macroBadges.map((preset) => <MacroBadgeIcon key={preset} preset={preset} />);
  return (
    // Whole card is tappable and expands in place -- the (i) info button is gone, replaced by
    // this and the FULL NUTRITION LABEL link below. The expand toggle is a SIBLING absolute-fill
    // Pressable, not a parent of the star/stepper/add/label-link Pressables: a Pressable inside
    // another Pressable double-fires/steals gestures in RN. Purely-visual children get
    // pointerEvents="none"/"box-none" so a tap not on one of the real controls falls through to
    // this background Pressable instead of being silently swallowed.
    <Reanimated.View layout={cellLayoutTransition(listOccluded)} style={[styles.row, (plateEntry || expanded) && styles.rowInPlate]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => toggleExpanded(dishKey)}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${item.dishName}`}
      />
      <View style={styles.rowMainLine} pointerEvents="box-none">
        <FavoriteStar isFavorite={isFavorite} dishName={item.dishName} onPress={() => toggleDishFavorite(item.dishName)} />
        <View style={styles.rowMain} pointerEvents="none">
          <View style={styles.rowNameLine} onLayout={handleNameContainerLayout}>
            <Text style={styles.rowText} onTextLayout={handleNameTextLayout}>
              {item.dishName}
            </Text>
            {/* Renders immediately, not gated on `measured` -- pr-reviewer caught that gating this
                on `measured` hid EVERY badged row's badges (not just wrapping ones) until
                onLayout/onTextLayout resolved, reintroducing the exact "badges appear out of
                nowhere" flash c551767 fixed, just universally instead of only on a cold cache. A
                wrapping name that's about to tuck instead repositions once measured. Measured on
                a cold mount (docs/decisions-log.md, 2026-09-12 "Badge tuck (#454) reported as
                'no change on device'"): the row paints stacked for ~450 ms, then snaps to tucked
                in one frame -- the row's `layout={LinearTransition...}` did NOT visibly cushion
                it. A known, visible hop on every cold mount of a wrapping badged row, still judged
                better than a guaranteed one-frame invisibility on every single badged dish. */}
            {macroBadges.length > 0 && !tucked && <View style={styles.macroBadgeRow}>{badgeIcons}</View>}
            {macroBadges.length > 0 && tucked && lastLine && (
              <View
                style={[
                  styles.macroBadgeRow,
                  styles.macroBadgeRowTucked,
                  { top: lastLine.y + (lastLine.height - MACRO_BADGE_SIZE) / 2, left: lastLine.x + lastLine.width + NAME_BADGE_GAP },
                ]}
              >
                {badgeIcons}
              </View>
            )}
          </View>
          {/* Price folds into the same uniform-color meta string as cal/protein
              (CafeMenuMixed.dc.html:43), no separate maroon-highlighted price Text. calorieRange
              (not-yet-composed) and the composed total (plateEntry.nutrition once on the plate)
              both replace item.nutrition -- CompositeDishRowStates.dc.html states 1/2.
              Two full <Text> branches, not a ternary INSIDE one <Text>'s children -- a fragment
              nested one level down changes this Text's own `children` prop shape (one Fragment
              element instead of several flat string/number children), which hallMenu.test.tsx's
              texts() helper (a shallow, one-level .flat()) can no longer see into. Keeping the
              non-composite branch's JSX identical (not merely equivalent) to before this feature
              existed is what keeps those pre-existing tests passing unmodified. */}
          {calorieRange ? (
            <Text style={styles.rowCalories}>
              {item.price ? `${item.price} · ` : ""}
              {Math.round(calorieRange.minCalories)}–{Math.round(calorieRange.maxCalories)} cal ·{" "}
              {Math.round(calorieRange.minProteinG)}–{Math.round(calorieRange.maxProteinG)}g protein
            </Text>
          ) : (
            <Text style={styles.rowCalories}>
              {item.price ? `${item.price} · ` : ""}
              {Math.round(displayNutrition.calories)} cal · {showFiber ? Math.round(displayNutrition.dietaryFiberG) : Math.round(displayNutrition.proteinG)}
              {showFiber ? "g fiber" : "g protein"}
            </Text>
          )}
        </View>
        <PlateAddControl
          plateEntry={plateEntry}
          item={item}
          onStep={(delta) => stepPlateItem(item, delta)}
          blocksScrollRefs={[activeListRef]}
          onQuickAdd={() => addToPlate(item)}
          onHoldStart={(anchor) => {
            dragStateRef.current = { item };
            holdSlideHostRef.current?.open(anchor);
          }}
          onHoldDrag={(count) => holdSlideHostRef.current?.updateCount(count)}
          onHoldEnd={() => {
            // 0 is the drag's cancel rung (CANCEL_SERVINGS), never a real add.
            if (dragStateRef.current && liveHoldCount.value > 0) {
              addToPlate(dragStateRef.current.item, liveHoldCount.value);
            }
            dragStateRef.current = null;
            holdSlideHostRef.current?.close();
          }}
          liveCount={liveHoldCount}
          liveIndex={liveHoldIndex}
          composite={
            composite
              ? {
                  hasSavedRecipe: composite.recipe !== null,
                  onOpenComposer: () => onOpenComposer(item, composite.addIns, null),
                  onReAddRecipe: () => onReAddRecipe(item),
                }
              : undefined
          }
        />
      </View>
      {expanded && (
        <Reanimated.View entering={FadeIn.duration(durations.rowExpandIn)} exiting={FadeOut.duration(durations.rowExpandOut)} style={styles.expandedContent} pointerEvents="box-none">
          <View style={styles.expandedDivider} pointerEvents="none" />
          {composedInPlate ? (
            <>
              <Text style={styles.servingSummary} pointerEvents="none">
                {composedInPlate.recipe?.addIns.filter((a) => a.count > 0).map((a) => a.item.dishName).join(" · ") ?? ""}
              </Text>
              <Pressable
                onPress={() => onOpenComposer(item, composedInPlate.addIns, composedInPlate.recipe)}
                hitSlop={8}
                style={styles.fullLabelLink}
                accessibilityRole="button"
                accessibilityLabel={`Edit add-ins for ${item.dishName}`}
              >
                <Text style={styles.fullLabelLinkText}>EDIT ADD-INS ›</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.servingSummary} pointerEvents="none">
                {formatServingSummary(item.nutrition)}
              </Text>
              {item.dietTags.length > 0 && (
                <View style={styles.dietChipRow} pointerEvents="none">
                  {item.dietTags.map((tag) => (
                    <View key={tag} style={styles.dietChip}>
                      <Text style={styles.dietChipText}>{tag.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Pressable
                onPress={() => setLabelItem(item)}
                hitSlop={8}
                style={styles.fullLabelLink}
                accessibilityRole="button"
                accessibilityLabel={`Full nutrition label for ${item.dishName}`}
              >
                <Text style={styles.fullLabelLinkText}>FULL NUTRITION LABEL ›</Text>
              </Pressable>
            </>
          )}
        </Reanimated.View>
      )}
    </Reanimated.View>
  );
}

export function HallMenuScreenBody({
  hall,
  initialMeal,
  stressFixture,
}: {
  hall: HallMenuSubject;
  initialMeal?: TabSelection;
  /** dev-only: selects a fixture set, see stressFixtureItems above. */
  stressFixture?: string;
}) {
  const isRealHall = hall.slug !== undefined;
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Retry card + "SHOW SAVED COPY" wiring: retryToken is bumped by TRY AGAIN to re-run the fetch
  // effect below; cachedMenu is looked up whenever the fetch fails, so the retry card knows
  // whether a saved copy exists (the link only renders when one does).
  const [retryToken, setRetryToken] = useState(0);
  const [cachedMenu, setCachedMenu] = useState<CachedMenu | null>(null);
  // The local dish-catalog cache, read once for the waterfall's tier-2 standing-menu-item
  // matching (resolveCafeMenuState) -- café only, a real hall never needs it. `catalogLoaded`
  // (not just `catalog !== null`, which can't tell an empty cache from "hasn't read yet") gates
  // cafeState below so the first paint already reflects what's cached instead of flipping rows
  // from unmatched to matched a frame later.
  const [catalog, setCatalog] = useState<CachedDishCatalog | null>(null);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  // Café info-only state's PDF affordance -- the same in-app viewer CafeSheet always opens, just
  // mounted here instead of from index.tsx.
  const [cafePdf, setCafePdf] = useState<{ url: string; label: string } | null>(null);
  // An unmatched standing-menu row's tap seeds this, then opens the plate sheet with it. Cleared
  // the moment the sheet closes so a later plain PlateBar tap doesn't reseed a stale query.
  const [plateSearchSeed, setPlateSearchSeed] = useState<string | null>(null);
  // Seeded from preferences.ts's in-memory cache (warmed at app launch, _layout.tsx) rather than a
  // bare placeholder -- otherwise this screen's first paint always renders zero macro badges, then
  // pops them in a frame later once the SQLite read below resolves.
  const [prefs, setPrefs] = useState<FoodPreferences>(() => getCachedPreferences() ?? { allergensToAvoid: [], requiredDietTags: [] });
  const [favoriteDishKeys, setFavoriteDishKeys] = useState<Set<string>>(new Set());
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);
  // Whether the hours fetch below has settled at all (resolved OR rejected) -- distinct from
  // `hoursFeed` itself being non-null, since a rejected fetch must still unblock a real hall's
  // shimmer gate rather than leaving it stuck loading forever (see that effect's own comment).
  const [hoursSettled, setHoursSettled] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => effectiveToday());
  // Static default rather than deriving from hoursFeed's currentMealPeriod on load -- hours
  // arrive async, and auto-jumping the tab out from under a user who already tapped one would be
  // worse than a fixed starting point.
  // ponytail: doesn't auto-select "whatever's being served now" the way Home's hero does; upgrade
  // to that once hoursFeed's initial load has a place to land it without racing a manual tap.
  //
  // A café has no fixed "lunch" tab to default to (People's Organic only ever has "allday") --
  // null here means "not yet chosen," resolved once items load by the effect below, to whichever
  // period deriveCafeMealTabs finds first. A real hall keeps the static "lunch" default unchanged.
  const [selectedMeal, setSelectedMeal] = useState<TabSelection | null>(initialMeal ?? (isRealHall ? "lunch" : null));
  // Tracks whether the user has manually picked a meal tab -- seeded true when initialMeal was
  // explicitly passed via route params, since that's an explicit choice that must never be
  // overridden by the current-meal-period auto-select effect below. Not state: flipping it must
  // never itself trigger a re-render.
  const hasManuallyPickedMeal = useRef(initialMeal !== undefined);
  // Set true right before the current-meal auto-correction effect below calls setSelectedMeal, so
  // MealTabPager snaps to it instead of visibly swiping through the tabs in between. Never set
  // for a real user swipe/tap, which goes through handleActiveIndexChange and keeps its tween.
  const mealTabInstantRef = useRef(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // A locationId-less café (hall.tid undefined) used to share a single `-1` sentinel hallTid
  // across every such café -- harmless before PlateSheet mounted for that state, wrong now (every
  // locationId-less café's logged dishes and "recent history" search would conflate into one
  // identity). syntheticHallTidForName gives each a distinct, stable per-name number instead.
  const cafeHallTid = hall.tid ?? syntheticHallTidForName(hall.name);

  // The local dish-catalog cache, read once on mount -- café only (a real hall's mealTabs/
  // sections never touch it). Fire-and-forget background refresh alongside it; refreshDishCatalogIfStale
  // is itself a no-op unless the local copy is actually stale.
  useEffect(() => {
    if (isRealHall) return;
    let current = true;
    getCachedDishCatalog().then((c) => {
      if (current) {
        setCatalog(c);
        setCatalogLoaded(true);
      }
    });
    refreshDishCatalogIfStale(supabase);
    return () => {
      current = false;
    };
  }, [isRealHall]);

  // The waterfall's own decision (resolveCafeMenuState, cafeMenu.ts) -- null while still
  // unresolved (real hall, ajax fetch still in flight, or the catalog read above hasn't settled),
  // otherwise exactly one of integrated/standing/info. Every render-time consumer below reads
  // THIS, never `items` directly, once it's a café -- `items` alone can't tell "still loading"
  // apart from "ajax genuinely came back empty, waterfall fell through to tier 2/3".
  //
  // `error` (a rejected ajax fetch, not just an empty result) is treated as "no ajax items" here,
  // same as a genuinely empty result -- `items ?? []` falls through to the standing/info tiers off
  // `hall.retailLoc` alone, which need no network beyond the hours feed already in hand.
  // `items === null && !error` is "still in flight," the one case this must NOT resolve for.
  const cafeState = useMemo<CafeMenuState | null>(() => {
    if (isRealHall || !catalogLoaded) return null;
    if (items === null && !error) return null;
    return resolveCafeMenuState(items ?? [], hall.retailLoc ? pickCafeMenuHtml(hall.retailLoc) : null, catalog, cafeHallTid, selectedDate);
  }, [isRealHall, items, error, catalogLoaded, catalog, hall.retailLoc, cafeHallTid, selectedDate]);

  // While the waterfall is still resolving (cafeState null), the loading skeleton would otherwise
  // assume the "integrated" shape (dish rows + filter FAB) -- wrong for the common café outcome
  // (info/standing). `hall.retailLoc`'s standing-menu HTML is already in hand at mount, so parsing
  // it here predicts "info" correctly whenever the ajax probe (the one truly unpredictable call)
  // turns out empty. It can't rule out a genuine "integrated" café ahead of that call landing, but
  // getting that case "wrong" just means the dish rows/FAB appear once ajax resolves, not
  // disappear. Standing vs. integrated is deliberately not distinguished here -- both keep the
  // filter FAB and a dish-row skeleton is a reasonable stand-in for either.
  const cafeSkeletonLooksLikeInfo = useMemo(() => {
    if (isRealHall || !hall.retailLoc) return false;
    return parseRetailMenuHtml(pickCafeMenuHtml(hall.retailLoc)).kind !== "items";
  }, [isRealHall, hall.retailLoc]);

  // Real-hall tabs: while `items` hasn't arrived yet, fall back to the full MEAL_TABS list so the
  // tab row/skeleton has something to render immediately (same "best guess while loading" shape as
  // before); once items land, deriveHallMealTabs narrows to whichever periods that day's feed
  // actually published (Berkshire has no breakfast key at all, Franklin almost never has late
  // night -- see that function's own doc). Same MEAL_TABS fallback when items resolves to a
  // genuinely empty array (nothing posted for the day at all, e.g. a holiday) -- deriveHallMealTabs
  // would otherwise return [], leaving only the Grab tab and no meal tab at all to select; the old
  // "four tabs, each showing its own empty state" UX is the correct one for that case, not zero tabs.
  const mealTabs = useMemo<readonly MealPeriod[]>(() => {
    if (isRealHall) {
      if (!items) return MEAL_TABS;
      const derived = deriveHallMealTabs(items);
      return derived.length > 0 ? derived : MEAL_TABS;
    }
    if (!cafeState) return [];
    if (cafeState.kind === "integrated") return deriveCafeMealTabs(cafeState.items);
    // "standing" is always exactly one synthetic "allday" tab, same as an integrated café whose
    // own items never split into breakfast/lunch/dinner -- "info" has no tabs at all, its own
    // top-level render branch below replaces the tab pager entirely rather than showing an empty
    // one.
    return cafeState.kind === "standing" ? (["allday"] as const) : [];
  }, [isRealHall, items, cafeState]);

  // Whether today's midday period is actually brunch (see isBrunchLunch's own doc) -- real-hall
  // only, since a café's "lunch" period (if it ever has one) isn't in scope for this feature.
  const isBrunchToday = useMemo(() => (isRealHall && items ? isBrunchLunch(items, mealTabs) : false), [isRealHall, items, mealTabs]);

  // Café-screen unification: every downstream consumer that used to read `items` for
  // filtering/sections/FilterSheet purposes (a real hall's own items, unchanged) now reads THIS --
  // for a café, the matched half of a "standing" state's entries (synthetic MenuItems, full
  // nutrition) or the plain ajax items of an "integrated" one; [] for "info" (nothing to filter) or
  // while cafeState is still unresolved.
  const effectiveItems = useMemo<MenuItem[]>(() => {
    if (isRealHall) return items ?? [];
    if (!cafeState) return [];
    if (cafeState.kind === "integrated") return cafeState.items;
    if (cafeState.kind === "standing") {
      return cafeState.entries.filter((e): e is Extract<StandingMenuEntry, { matched: true }> => e.matched).map((e) => e.item);
    }
    return [];
  }, [isRealHall, items, cafeState]);

  // Grab 'N Go's own items -- a different tid (GRAB_N_GO_TIDS), not a MealPeriod filter on this
  // hall's menu (see TabSelection's doc). Fetched lazily: only once the Grab tab is selected, so
  // browsing a hall that never opens Grab costs no extra network call. Re-fires on a date step
  // while active; fetchMenu already holds a 30-min in-memory cache, so flipping tabs back without
  // changing the date is a cache hit.
  const [grabItems, setGrabItems] = useState<MenuItem[] | null>(null);
  const [grabError, setGrabError] = useState<string | null>(null);

  // Dev-only `--stress compare-toast-ok|compare-toast-fail` (screenshot.sh): mounts a toast (and,
  // for the failure, the retained plate it would sit above) so its screenshot doesn't depend on a
  // real log write failing.
  const toastFixture = __DEV__ && stressFixture?.startsWith("compare-toast-") ? stressFixture : undefined;
  const [plate, setPlate] = useState<PlateEntry[]>(() =>
    toastFixture === "compare-toast-fail" ? stressFixtureItems(hall.tid ?? 0, "lunch").map((item, i) => menuItemToPlateEntry(item, i + 1)) : [],
  );
  // Composite dish (bowl composer) session state -- composite-dish-logic annotation. Keyed by the
  // BASE dish's own plate key, not the composer's own lifecycle, so a saved recipe survives the
  // base dish being stepped off the plate entirely (re-add without reopening the composer needs
  // the recipe to still be here after the PlateEntry itself is gone). Session-only, per the
  // brief's residency note -- never persisted, reset on remount same as `plate` itself.
  const [compositeRecipes, setCompositeRecipes] = useState<Record<string, CompositeRecipe>>({});
  // The composer's own data -- kept separate from `composerOpen` (below) so the sheet's own
  // closing animation (useDraggableSheet inside CompositeDishComposer) still has a base/addIns to
  // render while it plays out, same reason PlateSheet's own content stays mounted across its
  // visible prop toggling rather than being unmounted the instant it's told to close.
  const [composerTarget, setComposerTarget] = useState<{ base: MenuItem; addIns: MenuItem[]; initialRecipe: CompositeRecipe | null } | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  function openComposer(base: MenuItem, addIns: MenuItem[], initialRecipe: CompositeRecipe | null) {
    setComposerTarget({ base, addIns, initialRecipe });
    setComposerOpen(true);
  }
  function closeComposer() {
    setComposerOpen(false);
  }
  // "Add to Plate" -- folds base + every selected add-in into ONE PlateEntry (foldRecipeToPlateEntry),
  // REPLACING (never addOrIncrement -- see that function's own doc) any existing row for this base,
  // and remembers the recipe so a later re-add/"Edit add-ins" doesn't start from scratch.
  function commitComposerRecipe(base: MenuItem, recipe: CompositeRecipe) {
    const key = plateKeyFor({ type: "umass-menu", dishName: base.dishName, hallTid: base.hallTid });
    setCompositeRecipes((prev) => ({ ...prev, [key]: recipe }));
    setPlate((prev) => [...prev.filter((p) => p.key !== key), foldRecipeToPlateEntry(base, recipe)]);
    closeComposer();
  }
  // Tapping "+" on a composite dish that already has a saved recipe (not currently on the plate,
  // e.g. stepped back to 0) -- re-adds it directly, no composer round-trip.
  function reAddSavedRecipe(item: MenuItem) {
    const key = plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid });
    const recipe = compositeRecipes[key];
    if (!recipe) return;
    setPlate((prev) => [...prev.filter((p) => p.key !== key), foldRecipeToPlateEntry(item, recipe)]);
  }
  // Hold-and-drag add. The live count/ladder-position/cancel state during a drag are Reanimated
  // shared values, not React state -- HoldSlideAddButton writes them directly from its UI-thread
  // gesture worklet, and the overlay reads them the same way, so a drag never triggers a React
  // re-render of this component (which owns the whole dish-list SectionList; re-rendering it per
  // touch-move frame would force every visible row to re-render too). The item being committed on
  // release lives in dragStateRef, not closed-over state, so onHoldEnd never risks acting on a
  // stale render's item.
  const liveHoldCount = useSharedValue(MIN_DRAG_SERVINGS);
  const liveHoldIndex = useSharedValue(0);
  const holdSlideHostRef = useRef<HoldSlideHostHandle>(null);
  const dragStateRef = useRef<{ item: MenuItem } | null>(null);
  // One SectionList ref PER TAB VALUE, not a single shared ref -- MealTabPager keeps up to 3 meal-
  // period panes mounted at once (its own activeIndex ± 1 window; mealPane(period) is called once
  // per windowed tab, each attaching its own GestureSectionList's ref below), so a single shared
  // ref object would have whichever pane happens to mount/re-render LAST silently win `.current`,
  // with no relation to which tab is actually selected (pr-reviewer caught this on PR #458: the
  // station scrubber's scrollToLocation targeted an arbitrary windowed neighbor's list on every
  // tab except the one that happened to attach last). A Map keyed by tab VALUE (not array
  // position -- mealTabs can reorder/reshape across a date step) instead, created once and reused
  // forever, mirrors stationViewabilityHandlers's identical fix below for the same underlying
  // problem (RN's per-list identity requirements colliding with MealTabPager's windowed mounts).
  // `getListRef`'s return type is `any`, not ElementRef<typeof GestureSectionList>: the
  // `as unknown as typeof SectionList` cast above erases MenuItem's generic, so a properly-typed
  // ref doesn't line up with the erased type -- RNGH only needs *some* ref to resolve the
  // underlying native handler tag.
  const listRefs = useRef(new Map<TabSelection, RefObject<any>>()).current;
  function getListRef(tab: TabSelection): RefObject<any> {
    let ref = listRefs.get(tab);
    if (!ref) {
      ref = { current: null };
      listRefs.set(tab, ref);
    }
    return ref;
  }
  // Auto-opens under any "lookup-*" or "search-*" stress fixture (PlateSheet.tsx's LOOKUP_STRESS_FIXTURES/SEARCH_STATE_FIXTURES --
  // "lookup-hit"/"lookup-fetching"/"lookup-miss"/"lookup-rate-limited") or "catalog-refresh"
  // (decision 5, plate-search-semantics.md) -- screenshot.sh has no gesture for opening the sheet
  // AND typing a query, so these fixtures need to reach a rendered state from navigation alone,
  // same as this file's own stressFixtureItems needing no gesture at all.
  const [sheetOpen, setSheetOpen] = useState(() => __DEV__ && (!!stressFixture?.startsWith("lookup-") || !!stressFixture?.startsWith("search-") || stressFixture === "catalog-refresh"));
  // Separate from `sheetOpen` above (the Plate sheet) -- the two are independent modals. `events`
  // is separate from `hoursFeed`'s own load because it comes from a different endpoint
  // (get_beacons_events vs get_infov2).
  const [infoSheetOpen, setInfoSheetOpen] = useState(false);
  // FilterSheet's own open state, plus its two ephemeral (never persisted, "this menu only")
  // refinements -- plain local state that starts empty each mount; Clear All resets explicitly.
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [stationFilter, setStationFilter] = useState<Set<string>>(new Set());
  const [priceFilter, setPriceFilter] = useState<Set<PriceBucket>>(new Set());
  const [events, setEvents] = useState<DiningEvent[]>([]);
  const [labelItem, setLabelItem] = useState<MenuItem | null>(null);
  // PlateSheet's search-result confirm step and "create a custom food" row -- rendered as
  // siblings of PlateSheet's own <Modal>, not nested inside it: no precedent in this codebase for
  // a Modal mounted inside another Modal.
  const [searchDetailResult, setSearchDetailResult] = useState<PlateSearchResult | null>(null);
  const [customFoodFormOpen, setCustomFoodFormOpen] = useState(false);
  const [customFoodFormPrefill, setCustomFoodFormPrefill] = useState<string | undefined>(undefined);
  const [barHeight, setBarHeight] = useState(0);
  // Head-to-head compare sheet. `comparePair` outlives the close (the slide-out still needs its
  // content); `compareEntries` is the log the sheet deals from -- everything logged, this plate
  // included -- and `compareStore` is the device's ranking store, or an in-memory one under the
  // dev-only `--stress compare-pair` fixture (sheet open) or `compare-toast-rate` (the "Rate them" toast, sheet closed).
  const compareStress = __DEV__ && (stressFixture === "compare-pair" || stressFixture === "compare-toast-rate");
  const [fixture] = useState(() => (compareStress ? compareFixture() : null));
  const compareStore = fixture?.storage ?? rankingStorage;
  const compareEntries = useRef<LogEntry[]>(fixture?.entries ?? []);
  const [comparePair, setComparePair] = useState<[CompareCard, CompareCard] | null>(fixture?.pair ?? null);
  const [compareOpen, setCompareOpen] = useState(compareStress && stressFixture === "compare-pair");
  const [toast, setToast] = useState<{ kind: ToastKind; message: string; subline?: string; action?: { label: string; pair: [CompareCard, CompareCard] } } | null>(() =>
    toastFixture === "compare-toast-ok"
      ? { kind: "success", message: "Logged 3 items", subline: "640 cal · 65g protein" }
      : toastFixture === "compare-toast-rate" && fixture
        ? { kind: "success", message: "Logged 3 items", subline: "640 cal · 65g protein", action: { label: "Rate them", pair: fixture.pair } }
        : toastFixture === "compare-toast-fail"
        ? { kind: "failure", message: "Couldn’t log 2 of 3 items" }
        : null,
  );
  const [toastHeight, setToastHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const guardedLogPlate = useGuardedLogPlate(storage);
  const onFavoritesUpdate = useCallback((favs: Favorite[]) => setFavoriteDishKeys(new Set(favs.filter((f) => f.type === "dish").map(favoriteKey))), []);
  const guardedToggleFavorite = useGuardedToggleFavorite(favoritesStorage, onFavoritesUpdate);

  useEffect(() => {
    // `current` guards against a stale response winning a race: two quick date-stepper taps fire
    // two fetches, and network order isn't request order -- without this, an in-flight response
    // for a date the user already stepped away from can land after the current one and overwrite
    // it.
    let current = true;
    setItems(null);
    setError(null);
    setCachedMenu(null);
    const tid = hall.tid;
    if (tid === undefined) {
      // No locationId at all -- there's no tid to ever probe fetchMenu with, straight to the
      // waterfall's standing/info tiers off hall.retailLoc alone (cafeState below), same as an
      // ajax call that genuinely came back empty.
      setItems([]);
      return () => {
        current = false;
      };
    }
    fetchMenuAndRecordSeen(tid, selectedDate)
      .then((result) => {
        if (current) setItems(result);
      })
      .catch((e) => {
        if (!current) return;
        setError(String(e));
        // Only looked up on failure, not eagerly on every load -- the retry card is the only
        // place this matters, and it doesn't exist until there's an error to show it in.
        getCachedMenu(tid, selectedDate)
          .then((cached) => {
            if (current) setCachedMenu(cached);
          })
          .catch(() => {});
      });
    return () => {
      current = false;
    };
    // retryToken: not read inside the effect body, only bumped by TRY AGAIN to re-run this exact
    // fetch without duplicating its logic in a second function.
  }, [hall, selectedDate, retryToken]);

  useEffect(() => {
    if (!hall.slug || selectedMeal !== "grab") return;
    let current = true;
    setGrabItems(null);
    setGrabError(null);
    fetchMenuAndRecordSeen(GRAB_N_GO_TIDS[hall.slug], selectedDate)
      .then((result) => {
        if (current) setGrabItems(result);
      })
      .catch((e) => {
        if (current) setGrabError(String(e));
      });
    return () => {
      current = false;
    };
  }, [hall, selectedDate, selectedMeal]);

  // User-driven tab picks route through this wrapper (not setSelectedMeal directly) so the
  // current-meal-period auto-select effect below knows never to stomp a choice the user already
  // made -- the café auto-resolve effect just below is NOT user-driven and must not set this flag.
  function selectMeal(next: TabSelection) {
    hasManuallyPickedMeal.current = true;
    setSelectedMeal(next);
  }

  function retryMenuFetch() {
    setRetryToken((t) => t + 1);
  }

  function showSavedCopy() {
    if (!cachedMenu) return;
    setItems(cachedMenu.items);
    setError(null);
  }

  // A café's initial tab can't be a static default (see selectedMeal's own comment) -- once
  // mealTabs resolves, land on whichever period comes first. A manual tab choice survives
  // stepping the date, same as a real hall's, unless the new date's derived tab set no longer
  // contains it (mealTabs is per-day for both a café and, now, a real hall -- see deriveHallMealTabs)
  // -- then fall back to the first tab instead of silently rendering a stale tab's dishes with no
  // tab pill highlighted (already covered for cafés; extended to real halls once their own mealTabs
  // became dynamic too). `selectedMeal === "grab"` is exempted, not just left to `mealTabs.includes`
  // -- Grab is a real hall's own 5th tab and is deliberately never a member of `mealTabs` (see
  // TabSelection's own doc), so without this exemption every render would yank the user off Grab
  // and back onto mealTabs[0].
  useEffect(() => {
    if (mealTabs.length === 0 || selectedMeal === "grab") return;
    if (selectedMeal !== null && mealTabs.includes(selectedMeal as MealPeriod)) return;
    const firstTab = mealTabs[0];
    if (firstTab) setSelectedMeal(firstTab);
  }, [selectedMeal, mealTabs]);

  // Expanded state keys on dish identity alone (hallTid + dishName, via plateKeyFor), not meal
  // period or date -- the same dish name can recur across meals/days, so without this a card
  // expanded at Lunch could render pre-expanded after switching to Dinner or stepping the date.
  useEffect(() => {
    setExpandedKey(null);
  }, [selectedMeal, selectedDate]);

  useEffect(() => {
    if (!hall) return;
    // Hall-info sheet's hours data, real halls only. Independent of selectedDate: hours reflect
    // what's true right now, not the date being browsed. A failure here just leaves the sheet's
    // hours/address blank, never blocks the menu itself -- hoursSettled (below) still flips on a
    // rejection, same as a resolution, so a real hall's shimmer gate (which waits on hoursSettled,
    // not on hoursFeed being non-null) can't get stuck loading forever behind a dead hours fetch.
    // fetchHoursAndCache (not shared's bare fetchDiningHours), so this screen's own hours get
    // cached too -- otherwise offline recovery (SHOW SAVED COPY) works for the menu while the
    // info sheet right beside it still shows blank hours instead of a cached copy.
    fetchHoursAndCache()
      .then(setHoursFeed)
      .catch(() => {})
      .finally(() => setHoursSettled(true));
  }, [hall]);

  useEffect(() => {
    if (!hall) return;
    // Hall-info sheet's events row -- same unfiltered list for every hall (get_beacons_events
    // can't be filtered per-hall). A failure here just leaves the row on its empty-state copy.
    fetchEvents()
      .then(setEvents)
      .catch(() => {});
  }, [hall]);

  useFocusEffect(
    useCallback(() => {
      getPreferences().then(setPrefs);
      favoritesStorage.getFavorites().then((favs) => {
        setFavoriteDishKeys(new Set(favs.filter((f) => f.type === "dish").map(favoriteKey)));
      });
    }, []),
  );

  // A success toast dismisses itself, or it permanently covers the last menu row. A failure toast
  // stays until the next log attempt replaces it, the plate is edited, or it's tapped.
  useEffect(() => {
    if (toast?.kind !== "success" || toastFixture) return;
    const timer = setTimeout(() => setToast(null), toast.action ? toastActionDwell : toastDwell);
    return () => clearTimeout(timer);
  }, [toast, toastFixture]);
  const toastPlate = useRef(plate);
  useEffect(() => {
    if (toastPlate.current === plate) return;
    toastPlate.current = plate;
    setToast((t) => (t?.kind === "failure" ? null : t));
  }, [plate]);

  // Sections are stations (the foodpro category names). For the 3 real meal tabs, that's a single
  // meal period's worth of items. Grab 'N Go has no meal-period concept of its own -- its items
  // come back tagged with ordinary breakfast/lunch/etc. values with no filtering by any of them --
  // and needs a dedup step the other tabs don't: the same dish can appear twice under two
  // different mealPeriod values sharing one trimmed category, which would otherwise put two
  // identical rows sharing one plate stepper in the same section.
  // Every mounted pane computes its own sections (not just the selected tab) so the swipe pager's
  // windowed neighbors have real content to crossfade. Pulled out to lib/hallMenuSections.ts
  // (sectionsForPeriod/grabSections) so it's pure/testable and shared.
  // Station/price are ephemeral, "this menu only" refinements, filtered in HERE before
  // hallMenuSections.ts's own sectionsForPeriod/grabSections, which stays allergens/diet-tags
  // only per CLAUDE.md.
  // Grab 'N Go items are deliberately excluded from this filter: FilterSheet's "Stations Here"
  // checklist is built from `items` (this hall's own menu) only, not `grabItems` -- station-
  // filtering Grab against a checklist that never lists Grab's own categories would silently
  // empty that tab with no checkbox to undo it.
  // effectiveItems, not `items` directly -- a café's own matched-standing synthetic items need
  // the same station/price/macro filtering a real hall's items get.
  const stationPriceFilteredItems = useMemo(() => {
    const filtered = effectiveItems.filter((i) => itemMatchesStationAndPriceFilter(i, stationFilter, priceFilter));
    if (__DEV__ && stressFixture === "long-names" && hall.tid != null) {
      const tid = hall.tid;
      // Order in this array doesn't control section order -- sectionsForPeriod groups by category
      // and then runs the result through shared's sortStationNames (a fixed food-journey keyword
      // order), which ignores feed/array order entirely. "Stress Test" matches none of those
      // keywords, so left alone it sorts alphabetically AFTER every real station, at the very
      // bottom of a long list -- confirmed live 2026-09-12 (a screenshot.sh capture's uiautomator
      // dump never found the fixture's text without a long scroll past every real section first).
      // The actual "show up first, no scroll needed" fix is the unshift in sectionsByPeriod below;
      // this array's order is irrelevant to display order, just left as items-then-filtered so
      // station/price filtering above still runs over only the real feed items.
      return [...mealTabs.flatMap((period) => stressFixtureItems(tid, period)), ...filtered];
    }
    // Same "Stress Test" category as long-names above (reuses sectionsByPeriod's own
    // moveSectionToFront branch below) -- compositeFixtureItems's own doc explains why this is
    // fixture-only.
    if (__DEV__ && stressFixture === "composite" && hall.tid != null) {
      const tid = hall.tid;
      return [...mealTabs.flatMap((period) => compositeFixtureItems(tid, period)), ...filtered];
    }
    return filtered;
  }, [effectiveItems, stationFilter, priceFilter, stressFixture, mealTabs, hall.tid]);
  const sectionsByPeriod = useMemo(() => {
    const map = new Map<MealPeriod, MenuSection[]>();
    const isStressFixtureTab = __DEV__ && (stressFixture === "long-names" || stressFixture === "composite");
    for (const period of mealTabs) {
      const sections = sectionsForPeriod(stationPriceFilteredItems, period, prefs);
      // Dev-gated the same way stationPriceFilteredItems's stress-fixture branch above is; see
      // moveSectionToFront's own doc for why this is needed at all (sortStationNames doesn't know
      // about the synthetic "Stress Test" category). A no-op when the section isn't present
      // (stressFixture unset, or hidden by the user's own allergen/diet-tag filters).
      map.set(period, isStressFixtureTab ? moveSectionToFront(sections, "Stress Test") : sections);
    }
    return map;
  }, [stationPriceFilteredItems, mealTabs, prefs, stressFixture]);
  const grabSectionsMemo = useMemo(() => (grabItems ? grabSections(grabItems, prefs) : []), [grabItems, prefs]);

  // The station scrubber's own sections/list -- always whichever tab is actually selected, not
  // tied to a specific mounted pane the way periodSections/mealPane are (MealTabPager windows up
  // to 3 panes at once; the scrubber tracks only the one the user is actually looking at).
  const activeStationSections = useMemo<MenuSection[]>(() => {
    if (selectedMeal === "grab") return grabSectionsMemo;
    if (selectedMeal === null) return [];
    return sectionsByPeriod.get(selectedMeal) ?? [];
  }, [selectedMeal, sectionsByPeriod, grabSectionsMemo]);
  // getListRef(tab) always returns the SAME cached ref object for a given tab value (see its own
  // doc above), so this identity is stable across renders unless selectedMeal itself changes --
  // "grab" fallback for the null (café pre-load) case is inert, never actually read: StationScrubber
  // never renders while activeStationSections is [] (its own count<=1 guard).
  // Same lazy-ref-cache-during-render idiom as getStationViewabilityHandler below (see its own
  // doc for why this is safe).
  // eslint-disable-next-line react-hooks/refs
  const activeStationListRef = getListRef(selectedMeal ?? "grab");

  // Which station the list is currently scrolled to -- fed by onViewableItemsChanged on whichever
  // SectionList is actually selected (wired per-pane below). Reset on every tab switch, AND
  // whenever activeStationSections itself is rebuilt (station/price filter, allergen/diet-tag
  // filter, or a date step -- all three replace this array), so a stale index left over from a
  // longer/differently-ordered list doesn't linger. Filter changes self-correct almost immediately
  // anyway (the still-mounted SectionList's own cell layout keeps firing onViewableItemsChanged
  // even while a FilterSheet sits on top of it), but a date step fully unmounts/remounts the pane
  // -- there is no further scroll or layout event to correct a stale index against a settled,
  // unscrolled list, so it survives indefinitely (confirmed on-device 2026-09-17: still wrong 12s
  // later, not a one-frame blip -- station-filter-overlap brief, task 3).
  const [activeStationIndex, setActiveStationIndex] = useState(0);
  useEffect(() => setActiveStationIndex(0), [selectedMeal, activeStationSections]);

  // A SectionList's onViewableItemsChanged identity must never change across that list's own
  // lifetime (RN throws "Changing onViewableItemsChanged on the fly is not supported" if it does)
  // -- but mealPane/grabPane are plain functions re-invoked on every render (they can't call hooks
  // themselves, see mealPane's own doc on why it's a called function, not a tagged component), so
  // a fresh closure per render is exactly what a naive inline handler would produce. One stable
  // handler per TAB VALUE (not per array position -- mealTabs can reorder/reshape across a date
  // step) is cached here instead, created once and reused forever; it reads which tab is actually
  // selected AND that tab's current sections from a ref updated in the effect below (a render-time
  // write here would risk this handler observing a value from a render that later gets discarded).
  const scrubberLatestRef = useRef({ selectedMeal, sectionsByPeriod, grabSectionsMemo });
  useEffect(() => {
    scrubberLatestRef.current = { selectedMeal, sectionsByPeriod, grabSectionsMemo };
  }, [selectedMeal, sectionsByPeriod, grabSectionsMemo]);
  const stationViewabilityHandlers = useRef(new Map<TabSelection, (info: { viewableItems: ViewToken[] }) => void>());
  function getStationViewabilityHandler(tab: TabSelection) {
    let handler = stationViewabilityHandlers.current.get(tab);
    if (!handler) {
      handler = ({ viewableItems }) => {
        const latest = scrubberLatestRef.current;
        // A neighbor pane MealTabPager keeps windowed (±1) mounts and fires its own initial
        // viewability the moment it mounts, regardless of whether it's the tab actually on
        // screen -- ignored here rather than trusted, or switching tabs would flash the wrong
        // station highlighted until the real active pane's own next scroll event corrects it.
        if (latest.selectedMeal !== tab) return;
        const sections = tab === "grab" ? latest.grabSectionsMemo : (latest.sectionsByPeriod.get(tab as MealPeriod) ?? []);
        const idx = topViewableSectionIndex(viewableItems, sections);
        if (idx !== null) setActiveStationIndex(idx);
      };
      stationViewabilityHandlers.current.set(tab, handler);
    }
    return handler;
  }
  // Stable across the screen's lifetime -- same reasoning as onViewableItemsChanged above.
  const stationViewabilityConfig = useRef({ itemVisiblePercentThreshold: 40 }).current;

  // Required alongside the station scrubber's own scrollToLocation calls (mealPane/grabPane
  // below) -- VirtualizedList's scrollToIndex THROWS an uncaught invariant ("scrollToIndex should
  // be used in conjunction with getItemLayout or onScrollToIndexFailed...") the instant a jump
  // targets a row that hasn't rendered/measured yet, UNLESS this prop is present (pr-reviewer's
  // PR #458 finding: reproduced on a plain continuous drag, not a contrived case -- this screen's
  // row heights vary too much, with wrapping names and expand state, for getItemLayout to be a
  // viable alternative). RN does NOT do any recovery scroll on its own once this fires -- it's
  // entirely on this handler, per VirtualizedList.scrollToIndex's own source. Best-effort nudge
  // toward the failed target's approximate offset (RN's own documented pattern,
  // averageItemLength * flat index) so more cells render; StationScrubber's own retry (a
  // stale-guarded double-requestAnimationFrame re-issue of the exact target, in commitDragIndex)
  // is what converges the rest of the way once that's happened, whether from this nudge or from
  // the drag's own next touch-move naturally rendering more content. Not itself identity-
  // sensitive across renders the way onViewableItemsChanged is (VirtualizedList reads this prop
  // fresh on every scrollToIndex call, never caches it), so a plain per-render closure is fine --
  // no Map-of-stable-handlers needed here.
  // getScrollResponder().scrollTo, NOT `getListRef()?.scrollToOffset()`: SectionList
  // (Libraries/Lists/SectionList.js in this repo's own react-native) never re-exposes
  // VirtualizedSectionList's internal getListRef() on its ref -- only scrollToLocation/
  // recordInteraction/flashScrollIndicators/getScrollResponder/getScrollableNode/setNativeProps
  // -- so the previous chain optional-chained itself into a silent no-op from the day it shipped
  // (#458; hall-menu-scroll-recovery-dead-code brief). getScrollResponder() is the underlying
  // ScrollView, whose scrollTo takes a raw content offset.
  function handleScrollToIndexFailed(tab: TabSelection) {
    return (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      getListRef(tab).current?.getScrollResponder?.()?.scrollTo?.({ y: info.averageItemLength * info.index, animated: false });
    };
  }
  // FAB state: driven only by allergens/diet-tags currently hiding something -- macros never
  // filter, so they never drive this. Computed on the UNFILTERED item list (station/price
  // selections must not change what the badge reports).
  const hiddenCount = useMemo(() => effectiveItems.filter((i) => !menuItemMatchesPreferences(i, prefs)).length, [effectiveItems, prefs]);

  // FilterSheet is presentational/controlled (see its own doc) -- this screen owns persistence.
  function onChangePreferences(next: FoodPreferences) {
    setPrefs(next);
    setPreferences(next);
  }

  const totals = useMemo(() => computeDailyTotals("plate", toLogEntries(plate, "1970-01-01T00:00:00.000Z")), [plate]);
  const priceTotal = useMemo(() => totalPlatePrice(plate), [plate]);

  const hallHours = hoursFeed?.halls.find((h) => h.hallTid === hall.tid);
  // Café tid is never in DINING_HALLS, so hallHours comes back undefined for a café -- hoursRows
  // below degrades to [] and grabNGoWindow's lookup degrades to null, harmlessly (the café header
  // renders no glyph/sheet at all, so neither is ever read for a café).
  // Hall-info sheet's data, computed here (not inside HallInfoSheet) so the sheet stays a pure
  // presentational component -- hoursRows needs `new Date()` at render time for its NOW-highlight.
  // Read once per render, not on an interval: if the sheet is left open across a meal boundary
  // with no other re-render, the NOW pill goes stale until something else triggers one.
  const now = new Date();
  // get_infov2 (hoursFeed) only ever publishes TODAY's hours (hallInfoHoursRows' own doc) -- so the
  // dynamic, per-day mealTabs/isBrunchToday (derived from `items`, fetched for `selectedDate`) only
  // apply when the two dates actually agree. Stepped to a different day, the sheet falls back to
  // the fixed MEAL_TABS/no-brunch defaults rather than filtering/relabeling today's real hours by
  // some OTHER day's menu.
  const isSelectedDateToday = selectedDate.toDateString() === effectiveToday(now).toDateString();
  const hoursRows = hallHours ? hallInfoHoursRows(hallHours, now, isSelectedDateToday ? mealTabs : MEAL_TABS, isSelectedDateToday && isBrunchToday) : [];
  const grabNGoWindow = hoursFeed ? hallInfoGrabNGoWindow(hoursFeed.retail, hall.name) : null;
  const infoDirectionsUrl = directionsUrl(hallHours?.mapAddress);

  // A real hall's initial tab is hardcoded "lunch" regardless of what's being served right now.
  // Resolves once hallHours loads, landing on the current meal period -- but only if the user
  // hasn't already manually picked a tab. useLayoutEffect (not useEffect) so the correction
  // commits before paint of THIS render, but hallHours itself only arrives via an async fetch, so
  // this effect necessarily fires on a LATER render, after the interim "lunch" default already
  // painted once. mealTabInstantRef (set below, read by MealTabPager) is what keeps that
  // correction from reading as a visible swipe through the tabs -- useLayoutEffect alone just
  // avoids adding a second, synchronous flash on top of the async one.
  useLayoutEffect(() => {
    if (!isRealHall || hasManuallyPickedMeal.current || !hallHours) return;
    const period = currentMealPeriod(hallHours, new Date());
    // shouldAutoCorrectMealTab (hallMenuTabs.ts) owns the two-part guard's reasoning -- pulled
    // out as a pure predicate so it's unit-testable without mounting this screen or fighting
    // Jest's react-native-reanimated mock.
    if (!shouldAutoCorrectMealTab(period as MealPeriod, selectedMeal, mealTabs)) return;
    mealTabInstantRef.current = true;
    setSelectedMeal(period as MealPeriod);
    // ponytail: this still lets a single frame of the static "lunch" default paint before hours
    // resolve -- MealTabPager just no longer visibly swipes past it. Upgrade path: seed hallHours
    // synchronously from an in-memory (not SQLite) hours cache if one's ever added, so the very
    // first paint already lands on the real meal.
    // selectedMeal is read above (the no-op guard) -- listed so a manual pick's own setSelectedMeal
    // (which always sets hasManuallyPickedMeal.current first, see selectMeal) re-runs this effect
    // to bail via that ref check instead of comparing against a stale selectedMeal closure.
  }, [isRealHall, hallHours, mealTabs, selectedMeal]);

  // Whichever tab is currently selected, not always the hall's own -- the plate bar's empty-state
  // copy (below) needs to know if THIS tab's own list has loaded, not just the hall's. Error takes
  // priority over loading: a failed fetch leaves `items`/`grabItems` permanently null, so without
  // this a fetch failure would forever read as "still loading" instead of "failed". `isRealHall &&`
  // on the plain `error` half -- a café's rejected ajax fetch is folded into `cafeState` (falls
  // through to the standing/info tiers), never surfaced as an error to the plate bar either; a real
  // hall has no such fallback, so its own error still drives this.
  const currentTabError = selectedMeal === "grab" ? grabError : isRealHall && error;
  // isCurrentTabLoading (hallMenuTabs.ts): pulled out as a pure predicate -- the info-only café
  // case needs its own branch instead of reusing the real-hall/other-café "selectedMeal === null"
  // check.
  const currentTabLoading =
    !currentTabError &&
    isCurrentTabLoading({ selectedMeal, isRealHall, hasItems: !!items, hasGrabItems: !!grabItems, cafeStateKind: cafeState?.kind ?? null });

  // useCallback (not a plain function) on these four -- renderDishRow below wraps itself in
  // useCallback to stop rebuilding all 5 meal-tab SectionLists' renderItem identity (and thus
  // defeating their row memoization) on every unrelated re-render; that only actually stabilizes
  // renderDishRow if the handlers it closes over are themselves stable. toggleExpanded/addToPlate/
  // stepPlateItem only ever call a setState updater function, never read the current state value
  // directly, so an empty dep array is correct, not just convenient.
  const toggleExpanded = useCallback((key: string) => {
    setExpandedKey((prev) => toggleExpandedKey(prev, key));
  }, []);

  // #198: guarded per dish key -- see useGuardedToggleFavorite's own doc comment for why a rapid
  // second tap on the same star must be dropped, not re-decided from stale state.
  const toggleDishFavorite = useCallback(
    async (dishName: string) => {
      const favorite: Favorite = { type: "dish", dishName };
      await guardedToggleFavorite(favorite, favoriteDishKeys.has(favoriteKey(favorite)));
    },
    [favoriteDishKeys, guardedToggleFavorite],
  );

  const addToPlate = useCallback((item: MenuItem, count = 1) => {
    setPlate((p) => addOrIncrement(p, menuItemToPlateEntry(item, count)));
  }, []);

  const stepPlateItem = useCallback((item: MenuItem, delta: number) => {
    setPlate((p) => stepCount(p, plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid }), delta));
  }, []);

  // Single dispatch point for adding any of PlateSheet's 4 merged-search result kinds -- what the
  // search-result confirm step's NutritionLabel.onAddToPlate calls.
  function addSearchResult(result: PlateSearchResult, count: number) {
    setPlate((p) => addOrIncrement(p, plateSearchResultToPlateEntry(result, count)));
  }

  // Tapping an unmatched standing-menu row (UnmatchedMenuBlock, mealPane above) opens the plate
  // sheet's "add something else" search pre-filled with the item's own name, instead of leaving
  // it a dead end.
  function openUnmatchedItemSearch(name: string) {
    setPlateSearchSeed(name);
    setSheetOpen(true);
  }

  async function logPlate() {
    // Guarded by useGuardedLogPlate: drops a second tap that lands before this one's sequential
    // addEntry() writes finish, instead of duplicating every row with fresh ids. Also drops a tap
    // landing on an already-emptied plate. Local-date-prefixed loggedAt, not `.toISOString()`
    // (UTC) -- see nowLocalIso's own comment (evening logs otherwise file under tomorrow's date).
    const loggedAt = nowLocalIso();
    const plateAtLog = plate;
    const result = await guardedLogPlate(plate, loggedAt);
    if (!result) return;
    if (!result.ok) {
      // ponytail: no transaction wrapping the write loop, so a failure partway through leaves
      // whatever already succeeded committed, and the plate stays put (not cleared) so the user
      // doesn't lose their selection -- but retrying re-logs everything with fresh ids
      // (toLogEntries mints new random ids each call), so anything that already committed
      // becomes a duplicate row rather than being replaced. Acceptable for a UI feature where
      // each addEntry is one single-row insert unlikely to fail independently; upgrade to one
      // transactional bulk insert on SqliteLogStorage if this shows up in practice.
      setToast({ kind: "failure", message: `Couldn’t log ${formatServings(result.failed)} of ${formatServings(result.total)} ${result.total === 1 ? "item" : "items"}` });
      return;
    }
    setPlate([]);
    setSheetOpen(false);
    // "Rate them" pairs a dish from this plate with a dish logged BEFORE it -- this plate's own rows
    // are told apart by their shared loggedAt. Any read failure just means no action: the log itself
    // already succeeded.
    let action: { label: string; pair: [CompareCard, CompareCard] } | undefined;
    try {
      const all = await storage.getAllEntries();
      const pair = pickPostLogPair(
        all.filter((e) => e.loggedAt !== loggedAt),
        plateDishes(plateAtLog),
        await rankingStorage.getRankedDishes(),
      );
      if (pair) {
        compareEntries.current = all;
        action = { label: "Rate them", pair: [compareCard(all, pair[0]), compareCard(all, pair[1])] };
      }
    } catch {
      // no eligible opponent is the same outcome: the toast just has no action
    }
    setToast({
      kind: "success",
      message: `Logged ${formatServings(result.count)} ${result.count === 1 ? "item" : "items"}`,
      subline: `${Math.round(totals.calories)} cal · ${totals.proteinG.toFixed(0)}g protein`,
      action,
    });
  }

  function openCompare(pair: [CompareCard, CompareCard]) {
    setToast(null);
    setComparePair(pair);
    setCompareOpen(true);
  }

  // A pick writes both Elo tracks on-device (recordComparison), closes the sheet and offers another
  // pair. Null means a pick is already saving (a double tap) -- dropped, nothing else happens. A
  // failed save leaves the sheet up so the tap can be retried.
  async function pickComparison(winner: CompareCard, loser: CompareCard) {
    try {
      const saved = await recordComparison(compareStore, winner, loser);
      if (!saved) return;
      setCompareOpen(false);
      const food = saved.foods.find((f) => f.dishName === winner.dishName);
      const next = dealPair(compareEntries.current, saved.dishes, [winner, loser]);
      setToast({ kind: "success", message: winner.dishName, subline: food ? comparisonSubLine(food) : undefined, action: next ? { label: "Another", pair: next } : undefined });
    } catch {
      // the save failed: nothing was recorded and the sheet is still up for another tap
    }
  }

  async function skipComparison() {
    const next = dealPair(compareEntries.current, await compareStore.getRankedDishes(), comparePair);
    if (next) setComparePair(next);
  }

  // Shared by both SectionLists below (the 3 real meal tabs and the Grab tab) -- same dish-row
  // card, same plate/favorite/nutrition-label wiring, regardless of which tid the item came from.
  // useCallback, not a plain function: SectionList treats a changed `renderItem` identity as a
  // reason to re-render its visible rows, so a fresh closure every render was defeating that
  // memoization on all (up to 5) mounted panes on every unrelated state change.
  const renderDishRow = useCallback(
    ({ item }: { item: MenuItem }) => {
      // compositeDishFor is a cheap name-lookup against a small fixed map (see its own doc) --
      // fine to call fresh per row rather than threading another memo through this callback's deps.
      const compositeDef = compositeDishFor(item, stationPriceFilteredItems);
      const dishKey = plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid });
      return (
        <DishRow
          item={item}
          plate={plate}
          favoriteDishKeys={favoriteDishKeys}
          expandedKey={expandedKey}
          prefs={prefs}
          toggleExpanded={toggleExpanded}
          toggleDishFavorite={toggleDishFavorite}
          addToPlate={addToPlate}
          stepPlateItem={stepPlateItem}
          // getListRef(...) called fresh here (not the pre-computed activeStationListRef variable
          // above) so this useCallback's own dependency below is the PLAIN selectedMeal string, not
          // a ref object -- React Compiler refuses to preserve memoization for a callback whose deps
          // include something ref-shaped ("this dependency may be mutated later"), degrading the
          // whole component's optimization. getListRef itself is cheap/idempotent (a Map lookup).
          activeListRef={getListRef(selectedMeal ?? "grab")}
          holdSlideHostRef={holdSlideHostRef}
          dragStateRef={dragStateRef}
          liveHoldCount={liveHoldCount}
          liveHoldIndex={liveHoldIndex}
          setLabelItem={setLabelItem}
          composite={compositeDef ? { addIns: compositeDef.addIns, recipe: compositeRecipes[dishKey] ?? null } : null}
          onOpenComposer={openComposer}
          onReAddRecipe={reAddSavedRecipe}
          listOccluded={filterSheetOpen}
        />
      );
    },
    // selectedMeal: getListRef(selectedMeal ?? "grab") above resolves to a DIFFERENT cached ref
    // object once selectedMeal moves to a different tab -- omitting selectedMeal here would leave
    // this closure (and therefore every row's blocksScrollRefs) pointing at the PREVIOUS tab's
    // list ref after a tab switch, reintroducing a narrower version of the bug the per-tab ref map
    // above exists to fix.
    //
    // getListRef/openComposer/reAddSavedRecipe deliberately NOT listed -- exhaustive-deps wants
    // them since the callback body calls them, but getListRef's own function identity is recreated
    // every render while its OUTPUT for a given key never changes across the component's lifetime
    // (see its own doc: one ref object per tab value, cached forever in `listRefs`); openComposer/
    // reAddSavedRecipe are plain (non-useCallback) functions closing only over setState updaters,
    // same shape as addToPlate/stepPlateItem above but not itself memoized -- listing any of them
    // would rebuild this callback (and every mounted pane's renderItem identity) on every unrelated
    // re-render, exactly what this useCallback exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      plate,
      expandedKey,
      favoriteDishKeys,
      prefs,
      filterSheetOpen,
      toggleExpanded,
      toggleDishFavorite,
      addToPlate,
      stepPlateItem,
      liveHoldCount,
      liveHoldIndex,
      selectedMeal,
      stationPriceFilteredItems,
      compositeRecipes,
    ],
  );

  // Grab isn't in `mealTabs` (see TabSelection's own doc) -- appended as the swipeable sequence's
  // last item for a real hall only, matching the tab row's own rendering order below. `tabs`/
  // `activeIndex` are local to this screen; MealTabPager never sees TabSelection/MealPeriod/"grab",
  // just an index.
  const tabs: readonly TabSelection[] = isRealHall ? [...mealTabs, "grab" as const] : mealTabs;
  // -1 guard covers the café pre-load instant (selectedMeal still null, see its own comment above).
  const activeIndex = Math.max(0, tabs.indexOf(selectedMeal as TabSelection));
  function handleActiveIndexChange(i: number) {
    selectMeal(tabs[i]);
  }
  // Created here, not inside MealTabPager, so the tab row's own AnimatedTabUnderline can read the
  // exact same live drag/settle position the pager's pane crossfade uses. Initial value only
  // (useSharedValue's argument is read once, on first mount).
  const tabPanePos = useSharedValue(activeIndex);

  // One real meal period's pane. Error/loading checks stay per-pane (not hoisted above the
  // pager): `items`/`error` are hall-global, so every meal pane agrees regardless -- but Grab's
  // own pane below is checked independently, so it stays reachable even when the hall's regular
  // menu fetch failed.
  //
  // A plain function CALLED to produce JSX, not a component TAGGED as JSX (`mealPane(period)`,
  // not `<MealPane period={period} />`) -- tagging it would redeclare a fresh function/type
  // identity on every render (this function closes over items/prefs/etc.), and React reconciles
  // by element type: a changed type unmounts and remounts the whole subtree, tearing down each
  // pane's real SectionList (losing scroll position) on every parent re-render. Calling it as a
  // function returns the same *kind* of stable element React already knows how to reconcile.
  function mealPane(period: MealPeriod) {
    const periodSections = sectionsByPeriod.get(period) ?? [];
    // A "standing" state's unmatched rows (parseRetailMenuHtml items with no catalog hit) never
    // make it into `sectionsByPeriod` -- they aren't MenuItems, so they can't fit
    // hallMenuSections.ts's per-category MenuSection shape. Rendered as this SectionList's own
    // ListFooterComponent instead, below.
    const unmatchedEntries =
      !isRealHall && cafeState?.kind === "standing" && period === "allday"
        ? cafeState.entries.filter((e): e is Extract<StandingMenuEntry, { matched: false }> => !e.matched)
        : [];
    // Real-hall only -- a café's rejected ajax fetch is folded into `cafeState` above (falls
    // through to the standing/info tiers) rather than surfaced as a retry card; a real hall has no
    // such fallback, so its own error is still terminal here.
    if (isRealHall && error) {
      return <MenuErrorCard savedCopyTime={cachedMenu ? formatTime(new Date(cachedMenu.fetchedAt)) : null} onRetry={retryMenuFetch} onShowSavedCopy={showSavedCopy} />;
    }
    // A real hall's own `items` is the loading signal (mealTabs/tabs are the fixed MEAL_TABS
    // constant for a real hall, so this pane can be reached before the fetch even settles) --
    // `cafeState` is the café equivalent, and the one that's actually reliable there: a café's
    // `items` can stay `null` forever on a rejected ajax fetch even after `cafeState` has already
    // resolved via the fallback, so gating on `!items` for a café would skeleton-lock a
    // standing/integrated state that's already fully resolved and ready to render.
    // !hoursSettled: mirrors the tab row's own gate above -- a real hall's content pane must stay
    // in its loading state exactly as long as the tab labels above it do, or the two would resolve
    // on different frames.
    const stillLoading = isRealHall ? !items || !hoursSettled : !cafeState;
    if (stillLoading || selectedMeal === null) {
      // Header + meal tabs above already rendered fully (known without the network); only the
      // dish list itself is unknown, so only it shimmers. Widths vary a little so it doesn't read
      // as a uniform grid.
      return (
        <View style={styles.skeletonList}>
          <StationHeaderSkeleton width={fs(118)} />
          <DishCardSkeleton titleWidth={fs(150)} metaWidth={fs(100)} />
          <DishCardSkeleton titleWidth={fs(110)} metaWidth={fs(115)} />
          <DishCardSkeleton titleWidth={fs(170)} metaWidth={fs(95)} />
          <View style={styles.skeletonSpinnerRow}>
            <Spinner size={fs(14)} />
            <Text style={styles.skeletonSpinnerText}>Getting today&apos;s menu from UMass Dining…</Text>
          </View>
        </View>
      );
    }
    // unmatchedEntries.length > 0 keeps an all-unmatched standing menu (nothing the catalog has
    // ever seen -- e.g. a café whose whole menu is drinks) out of the empty state: every row
    // still shows, just without nutrition, instead of an honest-but-wrong "No matching dishes".
    if (periodSections.length === 0 && unmatchedEntries.length === 0) {
      // "for this day" matches grab-n-go/[slug].tsx's own EmptyState copy (date-agnostic by
      // construction, so it's correct whether selectedDate is today or not).
      return <EmptyState title="No matching dishes" message={`No ${cafeMealTabLabel(period, isRealHall, isBrunchToday).toLowerCase()} menu matches your filters at ${hall.name} for this day.`} />;
    }
    return (
      <GestureSectionList
        ref={getListRef(period)}
        sections={periodSections}
        keyExtractor={(item, index) => `${item.category}-${item.dishName}-${index}`}
        // extraData: single-expand needs a row OTHER than the one just tapped (whichever was
        // previously expanded) to re-render too -- SectionList/VirtualizedList's cell-level
        // memoization only busts on a change to `sections`/`item` identity or `extraData` by
        // default, not merely on `renderItem` getting a new closure (confirmed on-device: RTL's
        // `.props.onPress()` in hallMenu.test.tsx short-circuits straight to a real re-render and
        // never exposed this gap, but a real touch on-device left the previously-expanded row
        // stuck showing expanded alongside the newly-tapped one -- see the #117-successor ticket
        // that added single-expand). Independent multi-expand never hit this because tapping a row
        // only ever needed to update that SAME row, which the tap's own state change already
        // covers regardless of extraData.
        extraData={expandedKey}
        // clearFilterFab: this list always renders alongside the filter FAB (its own hide
        // condition, below, is exactly the state where effectiveItems is [] and this list
        // wouldn't render at all) -- reserve clearance for it, not just the plate bar.
        contentContainerStyle={{ paddingBottom: listBottomPadding(barHeight, true) + (toast ? toastHeight : 0) }}
        renderSectionHeader={({ section }) => (
          <Reanimated.View layout={cellLayoutTransition(filterSheetOpen)} style={styles.sectionHeaderWrap}>
            <SectionHeader title={section.title} />
          </Reanimated.View>
        )}
        renderItem={renderDishRow}
        // The standing-menu caveat banner renders in the tab strip's fixed position above (this
        // screen's own render, right below the header), not here as a ListHeaderComponent, so it
        // reads as a persistent state indicator, not scrollable content.
        ListFooterComponent={unmatchedEntries.length > 0 ? () => <UnmatchedMenuBlock entries={unmatchedEntries} onTapItem={openUnmatchedItemSearch} /> : undefined}
        onViewableItemsChanged={getStationViewabilityHandler(period)}
        viewabilityConfig={stationViewabilityConfig}
        onScrollToIndexFailed={handleScrollToIndexFailed(period)}
      />
    );
  }

  // Grab 'N Go's pane. When mounted as a windowed neighbor before it's ever been selected,
  // grabItems is still null, so this naturally shows the same loading skeleton it always has
  // between a tap/swipe-commit and the fetch resolving -- no eager fetch (see the lazy-fetch
  // effect above, gated on selectedMeal === "grab" alone).
  //
  // Same "call it, don't tag it" reasoning as mealPane above.
  function grabPane() {
    if (grabError) {
      return <Text style={styles.error}>Failed to load Grab &apos;N Go menu: {grabError}</Text>;
    }
    if (!grabItems) {
      return (
        <View style={styles.skeletonList}>
          <StationHeaderSkeleton width={fs(118)} />
          <DishCardSkeleton titleWidth={fs(150)} metaWidth={fs(100)} />
          <DishCardSkeleton titleWidth={fs(110)} metaWidth={fs(115)} />
          <DishCardSkeleton titleWidth={fs(170)} metaWidth={fs(95)} />
          <View style={styles.skeletonSpinnerRow}>
            <Spinner size={fs(14)} />
            <Text style={styles.skeletonSpinnerText}>Getting today&apos;s Grab &apos;N Go menu from UMass Dining…</Text>
          </View>
        </View>
      );
    }
    if (grabSectionsMemo.length === 0) {
      return <EmptyState title="No Grab 'N Go menu" message={`No Grab 'N Go items published at ${hall.name} for this day.`} />;
    }
    return (
      <GestureSectionList
        ref={getListRef("grab")}
        sections={grabSectionsMemo}
        keyExtractor={(item, index) => `${item.category}-${item.dishName}-${index}`}
        // extraData: see the meal-tab GestureSectionList's own comment above -- same single-expand
        // cross-row re-render requirement applies here.
        extraData={expandedKey}
        // clearFilterFab: see the meal-tab GestureSectionList's own comment above -- same
        // always-rendered-alongside-the-FAB reasoning applies here.
        contentContainerStyle={{ paddingBottom: listBottomPadding(barHeight, true) + (toast ? toastHeight : 0) }}
        renderSectionHeader={({ section }) => (
          <Reanimated.View layout={cellLayoutTransition(filterSheetOpen)} style={styles.sectionHeaderWrap}>
            <SectionHeader title={section.title} />
          </Reanimated.View>
        )}
        renderItem={renderDishRow}
        onViewableItemsChanged={getStationViewabilityHandler("grab")}
        viewabilityConfig={stationViewabilityConfig}
        onScrollToIndexFailed={handleScrollToIndexFailed("grab")}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Everything up to the PlateBar is the "behind the plate sheet" layer: PlateSheet is an
      in-tree overlay (not a Modal), so while it's open this wrapper takes the header, tabs, dish
      steppers, and filter FAB out of TalkBack/VoiceOver's navigation scope -- otherwise a
      screen-reader user could swipe to and activate controls hidden under the scrim. */}
      <View style={styles.behindSheet} {...behindSheetA11yProps(sheetOpen)}>
        <View style={[styles.header, { paddingTop: insets.top + spacing(4.5) }]}>
          <View style={styles.headerLeft}>
            {/* Back chevron is a SIBLING of the title-tap Pressable below, not nested inside it --
            a Pressable inside another Pressable double-fires/steals gestures in RN. */}
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
              <Text style={styles.backChevron}>‹</Text>
            </Pressable>
            {/* Title-tap (i) hall-info sheet is real-hall only: HallInfoSheet's data model has no
            sensible café equivalent. hallInfoHoursRows needs a DiningHallHours (breakfast/lunch/
            dinner/latenight, each its own window); RetailLocationHours carries one single `hours:
            TimeWindow | null` for the whole day, no per-meal breakdown to build real hoursRows
            from. The sheet's title caption is also hardcoded "Dining Commons". Cafés get no glyph
            and no sheet here rather than a decorative one that opens nothing real. */}
            {isRealHall ? (
              <Pressable
                style={styles.titleTap}
                onPress={() => setInfoSheetOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${hall.name} info`}
              >
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {hall.name}
                </Text>
                {/* Bare 13px stroke-circle hint, not a bordered-button circle -- turns gold while
                the sheet it opens is showing. */}
                <View style={[styles.infoHint, infoSheetOpen && styles.infoHintOpen]}>
                  <Text style={[styles.infoHintText, infoSheetOpen && styles.infoHintTextOpen]}>i</Text>
                </View>
              </Pressable>
            ) : (
              <Text style={styles.headerTitle} numberOfLines={1}>
                {hall.name}
              </Text>
            )}
          </View>
          <View style={styles.dateStepper}>
            <Pressable
              onPress={() => setSelectedDate((d) => stepDate(d, -1))}
              hitSlop={8}
              style={styles.dateStepperButton}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <Text style={styles.dateStepperChevron}>‹</Text>
            </Pressable>
            <Text style={styles.dateStepperLabel}>{formatDateStepperLabel(selectedDate)}</Text>
            <Pressable
              onPress={() => setSelectedDate((d) => stepDate(d, 1))}
              hitSlop={8}
              style={styles.dateStepperButton}
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <Text style={styles.dateStepperChevron}>›</Text>
            </Pressable>
          </View>
        </View>
        {/* A "standing" state has no real MealPeriod to build tabs from -- deriveCafeMealTabs' own
        "allday" synthetic tab would render as a degenerate single-tab strip ("ALL DAY"), which the
        design says shouldn't exist for this state. The caveat banner takes the tab strip's exact
        place instead -- same fixed position, not scrolled away with the list. */}
        {!isRealHall && cafeState?.kind === "standing" ? (
          // The tab strip this replaces carried its own bottom divider (tabRow's
          // borderBottomWidth) separating the header from what's below; same divider treatment,
          // wrapped around the banner instead of styled onto tabRow itself.
          <View style={styles.standingMenuBannerWrap}>
            <View style={styles.standingMenuBanner}>
              <NoteIcon color={withOpacity(colors.ink900, 50)} />
              <Text style={styles.standingMenuCaveat}>Today&apos;s menu isn&apos;t posted — standing menu from umassdining.com.</Text>
            </View>
          </View>
        ) : (
          <View style={styles.tabRow}>
            {mealTabs.map((period) => {
              const active = period === selectedMeal;
              return (
                <Pressable
                  key={period}
                  onPress={() => selectMeal(period)}
                  hitSlop={12}
                  style={styles.tab}
                  accessibilityRole="button"
                  accessibilityLabel={`${cafeMealTabLabel(period, isRealHall, isBrunchToday)} menu`}
                >
                  {/* items === null: that day's menu hasn't arrived yet, so the guessed MEAL_TABS
                      fallback label above (used only to pick which tabs to render at all) isn't
                      trustworthy enough to show as real text -- shimmer instead, same primitive as
                      the dish-list skeleton below, until items resolves (even to []). !hoursSettled:
                      `selectedMeal` starts hardcoded "lunch" until hallHours resolves and corrects
                      it (the useLayoutEffect above) -- items resolving alone isn't enough to trust
                      this row's content, since it renders whatever `selectedMeal` is at that instant
                      (hall-menu-correct-meal-on-load brief: without this, a hall opened outside
                      lunch hours flashes real "Lunch" content before snapping to the true period). */}
                  {isRealHall && (items === null || !hoursSettled) ? (
                    <SkeletonBar width={MEAL_TAB_SKELETON_WIDTH[period as HallMealPeriod]} height={fs(12)} />
                  ) : (
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{cafeMealTabLabel(period, isRealHall, isBrunchToday)}</Text>
                  )}
                  <View style={styles.tabUnderline}>
                    {/* tabs.indexOf, not this map's own index -- keeps every AnimatedTabUnderline (this
                        one and Grab's below) reading the same swipeable-sequence index MealTabPager
                        itself uses, immune to `tabs` ever reordering relative to `mealTabs`. */}
                    <AnimatedTabUnderline index={tabs.indexOf(period)} panePos={tabPanePos} />
                  </View>
                </Pressable>
              );
            })}
            <View style={styles.tabSpacer} />
            {/* Grab 'N Go is a hall-only 5th tab (its own station, not a MealPeriod) -- cafés have
                no slug and no such station. */}
            {hall.slug ? (
              <>
                <View style={styles.tabDivider} />
                <Pressable
                  onPress={() => selectMeal("grab")}
                  hitSlop={12}
                  style={styles.tab}
                  accessibilityRole="button"
                  accessibilityLabel={`${hall.name} Grab 'N Go menu`}
                >
                  <View style={styles.tabIconRow}>
                    <GrabBagIcon color={selectedMeal === "grab" ? colors.maroon900 : withOpacity(colors.ink900, 45)} />
                    <Text style={[styles.tabText, selectedMeal === "grab" && styles.tabTextActive]}>Grab &apos;N Go</Text>
                  </View>
                  <View style={styles.tabUnderline}>
                    <AnimatedTabUnderline index={tabs.indexOf("grab")} panePos={tabPanePos} />
                  </View>
                </Pressable>
              </>
            ) : null}
          </View>
        )}
  
        {!isRealHall && cafeState?.kind === "info" && hall.retailLoc ? (
          // The waterfall found nothing loggable at all (no ajax items, no standing-menu item
          // list -- maybe a PDF, maybe nothing) -- content only, no tab pager, mounted directly in
          // this same screen rather than a separate Modal/route. The `hall.retailLoc` guard is
          // defensive, not a real branch -- cafe/[name].tsx always resolves and passes it before
          // this screen ever mounts for a café; if it's somehow absent this just falls through to
          // the skeleton below instead of crashing on a missing prop.
          <ScrollView style={styles.infoScroll}>
            <CafeSheet
              loc={hall.retailLoc}
              now={new Date()}
              pdf={cafeState.pdf}
              onOpenPdf={(url, label) => setCafePdf({ url, label })}
              onOpenCustomFoodForm={(prefillName) => {
                setCustomFoodFormPrefill(prefillName);
                setCustomFoodFormOpen(true);
              }}
            />
          </ScrollView>
        ) : tabs.length === 0 ? (
          // Café pre-load: mealTabs hasn't resolved yet (real hall: never true; café: ajax fetch or
          // the dish-catalog read still in flight) -- same honest skeleton the non-Grab branch below
          // shows once there IS at least one tab, shown directly here without mounting a 0-pane
          // pager.
          //
          // cafeSkeletonLooksLikeInfo predicts this café won't have dish rows or a filter FAB at
          // all once it resolves -- a neutral spinner-only placeholder instead of the dish-row
          // skeleton, rather than committing to a shape that's about to disappear.
          cafeSkeletonLooksLikeInfo ? (
            <View style={styles.skeletonList}>
              <View style={styles.skeletonSpinnerRow}>
                <Spinner size={fs(14)} />
                <Text style={styles.skeletonSpinnerText}>Getting café info…</Text>
              </View>
            </View>
          ) : (
            <View style={styles.skeletonList}>
              <StationHeaderSkeleton width={fs(118)} />
              <DishCardSkeleton titleWidth={fs(150)} metaWidth={fs(100)} />
              <DishCardSkeleton titleWidth={fs(110)} metaWidth={fs(115)} />
              <DishCardSkeleton titleWidth={fs(170)} metaWidth={fs(95)} />
              <View style={styles.skeletonSpinnerRow}>
                <Spinner size={fs(14)} />
                <Text style={styles.skeletonSpinnerText}>Getting today&apos;s menu from UMass Dining…</Text>
              </View>
            </View>
          )
        ) : (
          // pagerArea wraps MealTabPager instead of the pager owning this positioning itself --
          // the scrubber is an absolute overlay INSIDE this same box (styles.pagerArea below is a
          // plain flex:1, so it changes nothing about the pager's own layout), sized to exactly the
          // pane content area without needing to duplicate the header/tab-row height math a
          // sibling-position approach would've needed. Keeps MealTabPager itself untouched.
          <View style={styles.pagerArea}>
            <MealTabPager
              activeIndex={activeIndex}
              onActiveIndexChange={handleActiveIndexChange}
              // react-hooks/refs flags this because mealPane/grabPane call
              // getStationViewabilityHandler, which reads/lazily-fills stationViewabilityHandlers's
              // ref map during render -- the standard "lazy ref initialization" idiom (React's own
              // docs allow writing a ref during render for one-time setup): each handler is created
              // at most once per tab value and its identity never changes after, so this is a stable
              // memoized read, not a render-purity violation the plugin can't otherwise see through.
              // eslint-disable-next-line react-hooks/refs
              panes={tabs.map((tab, i) => {
                // Only build the pane MealTabPager will actually mount (its own activeIndex ± 1
                // window, MealTabPager.tsx:292) -- mealPane/grabPane each construct a full
                // SectionList element tree; building all (up to 5) on every render was slow enough to
                // cause a menu/tab-label/underline desync on fast back-and-forth swiping, not just
                // visible jank.
                if (Math.abs(i - activeIndex) > 1) return null;
                return tab === "grab" ? grabPane() : mealPane(tab);
              })}
              instantRef={mealTabInstantRef}
              panePos={tabPanePos}
            />
            {activeStationSections.length > 1 && (
              <StationScrubber sections={activeStationSections} listRef={activeStationListRef} activeStationIndex={activeStationIndex} bottomInset={barHeight} />
            )}
          </View>
        )}
        {toast && (
          // The one surface a LOG failure shows on (the plate is retained on failure, so the bar
          // stays mounted where an in-flow banner would sit). Anchored 12 above the bar's measured
          // height (ToastLogFailed.dc.html), and reports its own height so the lists' paddingBottom
          // above can add it in while it's showing.
          <Toast
            kind={toast.kind}
            message={toast.message}
            subline={toast.subline}
            action={toast.action && { label: toast.action.label, onPress: () => openCompare(toast.action!.pair) }}
            bottom={listBottomPadding(barHeight) + spacing(3)}
            onDismiss={() => setToast(null)}
            onLayout={(e) => setToastHeight(e.nativeEvent.layout.height)}
          />
        )}
        {/* Permanent, in-context filter FAB -- pinned above the plate bar (48x48, right:20/
        bottom:108 per the canvas). Bare/inactive when nothing's currently hidden; dark-filled with
        a gold hidden-count badge once allergens/diet-tags are excluding something (macros never
        drive this). Opens FilterSheet in place, no navigation. Hidden entirely for the info-only
        state -- effectiveItems is always [] there. Also hidden while still resolving if
        cafeSkeletonLooksLikeInfo predicts "info", so it doesn't show only to disappear a moment
        later. */}
        {(cafeState ? cafeState.kind !== "info" : !cafeSkeletonLooksLikeInfo) && (
          <Pressable
            style={[styles.filterFab, hiddenCount > 0 && styles.filterFabActive]}
            onPress={() => setFilterSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={hiddenCount > 0 ? `Filters, hiding ${hiddenCount} ${hiddenCount === 1 ? "dish" : "dishes"}` : "Filters"}
          >
            <FilterGlyphIcon color={hiddenCount > 0 ? colors.paper50 : colors.maroon900} />
            {hiddenCount > 0 && (
              <View style={styles.filterFabBadge}>
                <Text style={styles.filterFabBadgeText}>{hiddenCount}</Text>
              </View>
            )}
          </Pressable>
        )}
        <PlateBar
          itemCount={totalItemCount(plate)}
          totals={totals}
          priceTotal={priceTotal}
          onPress={() => setSheetOpen(true)}
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
          // Always mounted (not just while the plate has items, still loading, or errored) -- the
          // bar is the only way to open the plate sheet, and the sheet's OFF search is exactly how
          // something not on the menu (a grabbed piece of fruit, say) gets logged when nothing else
          // is staged. "Visible-but-disabled" while loading -- only the loading LOG button is
          // spec'd disabled. All three are no-ops once the plate has real items: a populated plate
          // always shows the normal bar regardless of tab/fetch state.
          emptyState={
            currentTabLoading
              ? { subline: "add dishes once the menu loads", disabled: true }
              : { subline: "search for something not on the menu" }
          }
        />
      </View>
      <PlateSheet
        // Never both visible=true at once. Originally because Android silently drops a 2nd
        // simultaneous native Modal; PlateSheet is an in-screen overlay now (not a Modal -- see its
        // keyboard-follow note), but the mutual exclusion is kept as-is rather than re-deciding the
        // stacking UX in a keyboard bugfix.
        visible={resolvePlateAndCustomFoodVisibility(sheetOpen, customFoodFormOpen).plateSheetVisible}
        plate={plate}
        totals={totals}
        // Omitted (not hall.name alone) while selectedMeal is still null -- real for a café: its
        // own initial state is null until mealTabs derives from a still-in-flight fetchMenu (a real
        // hall's initial state is never null, see selectedMeal's own useState above), and PlateBar
        // is always tappable even before that resolves (its own doc comment), same as the lookup-*
        // stress fixtures that open this sheet synchronously on mount. hall.name alone is the exact
        // "<Hall>, no meal" bug this task fixed everywhere else -- pr-reviewer follow-up on
        // platesheet-search-results-parity-gap task 1 confirmed this window is genuinely reachable,
        // not just untested, on the café path. contextLabel is already optional (PlateSheet skips
        // rendering it entirely when falsy), so this briefly shows no subtitle instead of a wrong
        // one, then fills in correctly the moment selectedMeal resolves.
        contextLabel={selectedMeal ? plateSheetContextLabel(hall.name, selectedMeal, isRealHall, isBrunchToday) : undefined}
        logStorage={storage}
        customFoodsStorage={customFoodsStorage}
        hallTid={cafeHallTid}
        onStep={(key, delta) => setPlate((p) => stepCount(p, key, delta))}
        onSetCount={(key, count) => setPlate((p) => setCount(p, key, count))}
        onShowResultDetail={setSearchDetailResult}
        onOpenCustomFoodForm={(prefillName) => {
          setCustomFoodFormPrefill(prefillName);
          setCustomFoodFormOpen(true);
        }}
        onLog={logPlate}
        onClose={() => {
          setSheetOpen(false);
          setPlateSearchSeed(null);
        }}
        initialQuery={plateSearchSeed ?? undefined}
        stressFixture={stressFixture}
      />
      <CompareSheet visible={compareOpen} pair={comparePair} onPick={pickComparison} onSkip={skipComparison} onClose={() => setCompareOpen(false)} />
      <CompositeDishComposer
        // Never both visible at once, same Android dual-Modal reason as PlateSheet/CustomFoodForm
        // above -- viewing an add-in's Full Nutrition Label hides the composer instead of stacking
        // a second native Modal on top of it.
        visible={composerOpen && !labelItem}
        base={composerTarget?.base ?? null}
        addIns={composerTarget?.addIns ?? []}
        initialRecipe={composerTarget?.initialRecipe ?? null}
        onClose={closeComposer}
        onAddToPlate={commitComposerRecipe}
        onShowFullNutritionLabel={setLabelItem}
      />
      <FilterSheet
        visible={filterSheetOpen}
        items={effectiveItems}
        prefs={prefs}
        onChangePreferences={onChangePreferences}
        stationFilter={stationFilter}
        onChangeStationFilter={setStationFilter}
        priceFilter={priceFilter}
        onChangePriceFilter={setPriceFilter}
        // Grab's own sections are never station/price-filtered -- hide those two controls while
        // on the Grab tab instead of showing ones that would silently do nothing until switching
        // tabs.
        stationsPriceDisabled={selectedMeal === "grab"}
        hiddenCount={hiddenCount}
        onClose={() => setFilterSheetOpen(false)}
      />
      {/* Real-hall only -- a café has no glyph to open this from at all. `infoSheetOpen` can
      never become true for a café since no Pressable ever sets it there, but not mounting the
      sheet for one at all is the clearer signal. */}
      {isRealHall ? (
        <HallInfoSheet
          visible={infoSheetOpen}
          hallName={hall.name}
          address={hallHours?.address ?? null}
          directionsUrl={infoDirectionsUrl}
          hoursRows={hoursRows}
          grabNGoWindow={grabNGoWindow}
          events={events}
          onClose={() => setInfoSheetOpen(false)}
        />
      ) : null}
      {labelItem && (
        <NutritionLabel
          visible={!!labelItem}
          dishName={labelItem.dishName}
          // The feed's category already carries the meal period ("Breakfast Entrees") — don't
          // prefix mealPeriod again.
          subtitle={`${hall.name} · ${normalizeStationName(labelItem.category)}`}
          nutrition={labelItem.nutrition}
          allergens={labelItem.allergens}
          dietTags={labelItem.dietTags}
          ingredients={labelItem.ingredients}
          onAddToPlate={(count) => {
            addToPlate(labelItem, count);
            setLabelItem(null);
          }}
          onClose={() => setLabelItem(null)}
        />
      )}
      {/* PlateSheet's search-result confirm step -- a 2nd NutritionLabel instance, siblings not
      nested. Reuses the same generic component unmodified: plateSearchResultDetail (lib/plate.ts)
      maps any of the 4 PlateSearchResult kinds onto NutritionLabel's props, same as labelItem's
      MenuItem does above. */}
      {searchDetailResult && (
        <NutritionLabel
          visible={!!searchDetailResult}
          {...plateSearchResultDetail(searchDetailResult)}
          onAddToPlate={(count) => {
            addSearchResult(searchDetailResult, count);
            setSearchDetailResult(null);
          }}
          onClose={() => setSearchDetailResult(null)}
        />
      )}
      <CustomFoodForm
        // Same resolver as PlateSheet's `visible` above -- CustomFoodForm always wins.
        visible={resolvePlateAndCustomFoodVisibility(sheetOpen, customFoodFormOpen).customFoodFormVisible}
        initialName={customFoodFormPrefill}
        customFoodsStorage={customFoodsStorage}
        onSaved={() => setCustomFoodFormOpen(false)}
        onClose={() => setCustomFoodFormOpen(false)}
      />
      <HoldSlideHost ref={holdSlideHostRef} liveIndex={liveHoldIndex} />
      {/* The info-only state's PDF affordance (CafeSheet above) -- mounted here, alongside this
      screen's own NutritionLabel/FilterSheet/etc. modals, instead of from index.tsx. */}
      {cafePdf ? <CafePdfViewer url={cafePdf.url} label={cafePdf.label} cafeName={hall.name} onClose={() => setCafePdf(null)} /> : null}
    </View>
  );
}

/** `/halls/[slug]` route: resolves the slug against DINING_HALLS and hands off to the shared
 * body above. `/cafe/[name]` is the other caller of HallMenuScreenBody -- same screen, a café's
 * {tid, name} with no slug. */
export default function HallMenuScreen() {
  // `meal` is the retired /grab-n-go/[slug] route's replacement deep link (grabRouteFor,
  // lib/grabStrip.ts): "grab" preselects the Grab 'N Go tab instead of pushing a separate screen.
  // Any other/missing value falls through to the normal default (isRealHall ? "lunch" : null).
  const { slug, meal, stress } = useLocalSearchParams<{ slug: string; meal?: string; stress?: string }>();
  const hall = DINING_HALLS.find((h) => h.slug === slug);
  // Only reachable via a crafted deep link (no in-app path produces an unknown slug), but a dead
  // end with no way back is still a bug -- same back-chevron affordance every other header-less
  // route in this file already draws.
  if (!hall)
    return (
      <View style={styles.container}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.error}>Unknown dining hall</Text>
      </View>
    );
  return <HallMenuScreenBody hall={hall} initialMeal={meal === "grab" ? "grab" : undefined} stressFixture={stress} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream100 },
  // Fills the container so the absolutely-positioned PlateBar/FAB/logged banner inside it keep
  // their bottom/right anchoring exactly as when they were the container's direct children.
  behindSheet: { flex: 1 },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body400 },
  // Info-only state -- CafeSheet's content, scrollable in place of the tab pager.
  infoScroll: { flex: 1 },
  skeletonList: { paddingHorizontal: spacing(5), paddingTop: spacing(3), gap: spacing(2) },
  // Wraps MealTabPager so the station scrubber (an absolute overlay, see its own render below)
  // can size itself off exactly the pane content box -- flex:1 only, otherwise a no-op on the
  // pager's own layout.
  pagerArea: { flex: 1 },
  skeletonSpinnerRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginTop: spacing(2), justifyContent: "center" },
  skeletonSpinnerText: { fontFamily: fonts.body500, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(1.5),
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing(3), flexShrink: 1, minWidth: 0 },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  // The whole title group (name + (i) hint) is one tap zone opening the hall-info sheet.
  titleTap: { flexDirection: "row", alignItems: "center", gap: spacing(1.5), flexShrink: 1, minWidth: 0 },
  headerTitle: {
    flexShrink: 1,
    fontFamily: fonts.display700,
    fontSize: fs(22),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  // Bare 13px thin-stroke circle, not a bordered-button circle -- the canvas's rejected 30px/22px
  // variants were chunkier affordances, not this. flexShrink: 0 so the hint never gets squeezed out
  // by a long hall name (Worcester/Hampshire) before the name itself starts truncating.
  // Real-hall only (#219 review post-#207-rebase) -- no cafeInfoGlyph counterpart; see the header
  // render's own comment on why a café gets neither this nor a sheet to open with it.
  infoHint: {
    width: fs(13),
    height: fs(13),
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: withOpacity(colors.ink900, 45),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: spacing(0.5),
  },
  infoHintOpen: { borderColor: colors.gold500 },
  infoHintText: { fontFamily: fonts.body600, fontSize: fs(8), lineHeight: fs(9), color: withOpacity(colors.ink900, 45) },
  infoHintTextOpen: { color: colors.gold500 },

  dateStepper: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  dateStepperButton: {
    width: fs(30),
    height: fs(30),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 20),
    alignItems: "center",
    justifyContent: "center",
  },
  dateStepperChevron: { fontFamily: fonts.body400, fontSize: fs(14), color: colors.maroon900 },
  dateStepperLabel: {
    fontFamily: fonts.body600,
    fontSize: fs(11),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: withOpacity(colors.ink900, 60),
  },

  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2.5),
    paddingHorizontal: spacing(5),
    borderBottomWidth: 1,
    borderColor: withOpacity(colors.ink900, 15),
    marginBottom: spacing(1),
  },
  tab: { paddingVertical: spacing(2.5), alignItems: "center" },
  tabIconRow: { flexDirection: "row", alignItems: "center", gap: spacing(1) },
  tabText: {
    fontFamily: fonts.display600,
    fontSize: fs(12),
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: withOpacity(colors.ink900, 45),
  },
  tabTextActive: { color: colors.maroon900 },
  // Just the layout slot (height/width/spacing) -- AnimatedTabUnderline paints the actual fill,
  // absolutely positioned inside this, so it can animate independently per-tab off the live pane
  // position instead of snapping between a flat "transparent"/"gold" swap on commit.
  tabUnderline: { height: 3, width: "100%", marginTop: spacing(1), borderRadius: 2, overflow: "hidden" },
  tabSpacer: { flexGrow: 1 },
  tabDivider: { width: 1, height: fs(16), backgroundColor: withOpacity(colors.ink900, 20) },

  sectionHeaderWrap: {
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
    paddingBottom: spacing(2),
    backgroundColor: colors.cream100,
  },

  // Standing-menu caveat banner + unmatched-item block, same visual language CafeSheet's own
  // (now-retired) menu card used.
  //
  // standingMenuBannerWrap takes the tab strip's exact place -- same bottom divider
  // (borderBottomWidth/borderColor) tabRow carried, so the header-to-content transition reads the
  // same regardless of which of the two this café shows.
  standingMenuBannerWrap: {
    paddingBottom: spacing(1),
    borderBottomWidth: 1,
    borderColor: withOpacity(colors.ink900, 15),
  },
  standingMenuBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2.5),
    marginHorizontal: spacing(5),
    marginTop: spacing(1),
    marginBottom: spacing(2),
    backgroundColor: withOpacity(colors.ink900, 5),
    borderRadius: fs(8),
    paddingVertical: spacing(2.25),
    paddingHorizontal: spacing(3.5),
  },
  standingMenuCaveat: { flex: 1, fontFamily: fonts.body400, fontSize: fs(11), lineHeight: fs(15), color: withOpacity(colors.ink900, 60) },
  unmatchedBlock: { paddingBottom: spacing(3), gap: spacing(2) },
  // Dashed border (not the matched dish rows' solid divider/card look) -- a structural,
  // always-visible cue that this row is "unconfirmed," not just a plainer dish row.
  unmatchedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    marginHorizontal: spacing(5),
    paddingVertical: spacing(2.5),
    // Spec (CafeMenuMixed.dc.html:50) pins this at 12px, matching every other menu row's card
    // padding -- was 14 (spacing(3.5)).
    paddingHorizontal: spacing(3),
    // Spec (CafeMenuMixed.dc.html:50) wants the same paper50 card surface every other menu row
    // gets -- this row had none, so it rendered on the bare screen background instead.
    backgroundColor: colors.paper50,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: withOpacity(colors.maroon600, 40),
    borderRadius: radii.md,
  },
  unmatchedRowMain: { flex: 1, gap: 2 },
  unmatchedRowName: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  // fontSize fs(12), not fs(11) -- spec (CafeMenuMixed.dc.html:53) pins this at 12px.
  unmatchedRowMeta: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.maroon600, 75) },
  // Same 44x44 circular touch-target badge every other dish-row action icon gets (see
  // HoldSlideAddButton's addButton style) -- spec (CafeMenuMixed.dc.html:55) wraps the magnifier
  // in one instead of rendering it bare.
  unmatchedRowIcon: {
    width: fs(44),
    height: fs(44),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    alignItems: "center",
    justifyContent: "center",
  },

  row: {
    flexDirection: "column",
    gap: spacing(2.5),
    marginHorizontal: spacing(5),
    marginBottom: spacing(2),
    backgroundColor: colors.paper50,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3),
  },
  rowInPlate: { borderColor: colors.gold500 },
  rowMainLine: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  rowMain: { flex: 1, gap: 1 },
  rowNameLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing(2) },
  rowText: { fontSize: fs(14), fontFamily: fonts.body600, color: colors.ink900, flexShrink: 1 },
  rowCalories: { fontSize: fs(12), fontFamily: fonts.mono, color: withOpacity(colors.ink900, 60) },
  macroBadgeRow: { flexDirection: "row", gap: spacing(1) },
  // Positioned via inline top/left (DishRow, off the dish name's own last onTextLayout line) once
  // shouldTuckBadges says it fits -- rowNameLine (its parent here) keeps RN's default `relative`
  // position, so these coordinates are relative to it.
  macroBadgeRowTucked: { position: "absolute" },
  filterFab: {
    position: "absolute",
    right: 20,
    bottom: 108,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: withOpacity(colors.ink900, 20),
    backgroundColor: colors.paper50,
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  filterFabActive: {
    backgroundColor: colors.maroon900,
    borderColor: colors.maroon900,
    shadowOpacity: 0.35,
    elevation: 6,
  },
  filterFabBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: colors.gold500,
    borderWidth: 2,
    borderColor: colors.cream100,
    alignItems: "center",
    justifyContent: "center",
  },
  filterFabBadgeText: { fontSize: 9, fontFamily: fonts.mono, fontWeight: "700", color: colors.maroon900 },
  expandedContent: { gap: spacing(2.5) },
  expandedDivider: { height: 1, backgroundColor: withOpacity(colors.ink900, 10) },
  servingSummary: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 70) },
  dietChipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) },
  dietChip: {
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 20),
    borderRadius: radii.pill,
    paddingVertical: spacing(0.75),
    paddingHorizontal: spacing(2.25),
  },
  dietChipText: { fontFamily: fonts.body600, fontSize: fs(10), letterSpacing: 0.5, color: colors.maroon900 },
  // #117 review: this link is now the ONLY path to the nutrition label (the (i) button it
  // replaced was a 44dp square). minHeight is a fixed 44, not fs(44)/spacing() -- per theme.ts's
  // own doc comment, touch targets deliberately don't scale down on narrow screens.
  fullLabelLink: { flexDirection: "row", alignItems: "center", gap: spacing(1), minHeight: 44 },
  fullLabelLinkText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600 },

  // overflow hidden is the whole trick -- see PlateAddControl's own doc comment. alignItems:
  // "flex-end" is load-bearing, not decoration: stepperRow has a fixed width wider than this
  // clip's own (animated, narrower-than-content while collapsed) width, and the default stretch
  // alignment falls back to flex-start for a fixed-width child -- which anchors the row's LEFT
  // edge to the clip's left edge instead of the row's right edge to the clip's right edge. Since
  // the visible window is always [0, clipWidth] measured from the row's own left edge, without
  // this the collapsed clip showed the row-reverse row's OTHER end (the "−" button) instead of
  // the "+" slot -- pr-reviewer catch, verified against RN's actual Yoga layout output.
});
