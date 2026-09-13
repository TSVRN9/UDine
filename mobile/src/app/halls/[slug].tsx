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
} from "react-native";
import { createNativeWrapper } from "react-native-gesture-handler";
import Reanimated, {
  FadeIn,
  FadeOut,
  FadeOutDown,
  FadeInDown,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { DishCardSkeleton, Spinner, StationHeaderSkeleton } from "../../components/Skeleton";
import { EmptyState, SectionHeader } from "../../components/ui";
import { CafePdfViewer } from "../../components/CafePdfViewer";
import { CafeSheet } from "../../components/CafeSheet";
import { FavoriteStar } from "../../components/FavoriteStar";
import { FilterSheet, itemMatchesStationAndPriceFilter, MACRO_PRESET_LABELS, type PriceBucket } from "../../components/FilterSheet";
import { HallInfoSheet } from "../../components/HallInfoSheet";
import { HoldSlideAddButton } from "../../components/HoldSlideAddButton";
import { HoldSlideHost, type HoldSlideHostHandle } from "../../components/HoldSlideOverlay";
import { AnimatedTabUnderline, MealTabPager } from "../../components/MealTabPager";
import { MenuErrorCard } from "../../components/MenuErrorCard";
import { CustomFoodForm } from "../../components/CustomFoodForm";
import { NutritionLabel } from "../../components/NutritionLabel";
import { PlateBar } from "../../components/PlateBar";
import { PlateSheet } from "../../components/PlateSheet";
import { durations } from "../../lib/motion";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../../lib/theme";
import { formatTime, retailHeaderSubtitle, retailOpenStatus } from "../../lib/homeHero";
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
  shouldAutoCorrectMealTab,
  stepDate,
  toggleExpandedKey,
} from "../../lib/hallMenuTabs";
import { deriveCafeMealTabs, pickCafeMenuHtml, resolveCafeMenuState, syntheticHallTidForName, type CafeMenuState, type StandingMenuEntry } from "../../lib/cafeMenu";
import { getCachedDishCatalog, refreshDishCatalogIfStale, type CachedDishCatalog } from "../../lib/dishCatalog";
import { grabSections, moveSectionToFront, sectionsForPeriod, type MenuSection } from "../../lib/hallMenuSections";
import { macroBadgeRowWidth, shouldTuckBadges } from "../../lib/hallMenuBadgeLayout";
import { findGrabNGoLocation } from "../../lib/grabStrip";
import { MacroPresetGlyph } from "../../lib/macroBadgeGlyphs";
import { SqliteFavoritesStorage, useGuardedToggleFavorite } from "../../lib/favoritesStorage";
import { SqliteCustomFoodsStorage } from "../../lib/customFoodsStorage";
import { fetchMenuAndRecordSeen } from "../../lib/menuFetchWithSeenTracking";
import { fetchHoursAndCache, getCachedMenu, type CachedMenu } from "../../lib/menuHoursCache";
import { supabase } from "../../lib/supabase";
import {
  addOrIncrement,
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
  type PlateEntry,
  type PlateSearchResult,
} from "../../lib/plate";
import { getCachedPreferences, getPreferences, setPreferences } from "../../lib/preferences";
import { formatServings, MIN_DRAG_SERVINGS } from "../../lib/servingsStepper";
import { nowLocalIso } from "../../lib/date";
import { SqliteLogStorage } from "../../lib/sqliteStorage";

// react-native-gesture-handler doesn't export a gesture-aware SectionList (only ScrollView/
// FlatList wrap createNativeWrapper for you); a plain SectionList nested under MealTabPager's
// GestureDetector doesn't participate in RNGH's native touch arbitration, so its scroll can
// steal a touch mid-drag and cancel an in-progress pane swipe.
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

/** Dev-only layout stress fixture (docs/agents/dev-tracks.md's UI check + mobile/scripts/
 * screenshot.sh's --stress flag) -- a synthetic dish shaped to exercise two worst-case row
 * layouts real menu data may not contain: a name long enough to wrap, and nutrition that clears
 * every macro-badge threshold at once (shared/src/types.ts's MACRO_PRESET_CHECKS). __DEV__-gated
 * and opt-in only via the `stress` route param -- never runs in production. One instance per
 * meal period, so it shows up under whichever tab a screenshot lands on. */
function stressFixtureItem(hallTid: number, mealPeriod: MealPeriod): MenuItem {
  return {
    dishName: "Mediterranean Roasted Vegetables & Chickpeas Deluxe Harvest Bowl (Stress Fixture)",
    category: "Stress Test",
    mealPeriod,
    hallTid,
    date: new Date().toISOString().slice(0, 10),
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
    allergens: [],
    dietTags: [],
  };
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

// Standalone empty-plate "+" circle only (ServingsF.dc.html:69/79 -- 44x44). The in-plate
// stepper's own plus segment is narrower (IN_PLATE_PLUS_WIDTH below) -- the artboards draw them
// at different widths; the slot's height and pinned-right position stay shared, only the width
// differs per state, a 4px shift on the add/remove transition.
const PLUS_SLOT_SIZE = fs(44);
// Literal, not fs(40) -- spec (ServingsF.dc.html:58/60/96/98) pins the in-plate stepper's +/-
// segments at 40px each; touch targets don't scale. Distinct from PLUS_SLOT_SIZE (44px), the
// standalone empty-plate "+" circle.
const IN_PLATE_PLUS_WIDTH = 40;
// Literal, not fs(40) -- spec (ServingsF.dc.html:58) pins the minus slot at 40px; touch targets
// don't scale (see fs()'s own doc comment).
const MINUS_SLOT_WIDTH = 40;
const COUNT_SLOT_WIDTH = fs(34);
// Precomputed outside the worklet below -- withOpacity isn't worklet-marked, and calling a plain
// JS-thread function from inside useAnimatedStyle's UI-thread callback throws. Worklets can
// close over a plain string constant fine; they just can't call out to arbitrary JS per frame.
const MAROON_TRANSPARENT = withOpacity(colors.maroon600, 0);
const STEPPER_FULL_WIDTH = IN_PLATE_PLUS_WIDTH + COUNT_SLOT_WIDTH + MINUS_SLOT_WIDTH;

/** Filled maroon pill -- the dish row's add control. The empty-plate "+" and the in-plate
 * "− N +" stepper are the SAME persistent element, not two components swapped by a ternary. The
 * "+" slot (`flexDirection: row-reverse`, so it renders pinned to the right) never moves; growing
 * the pill just animates this wrapper's `width` from `PLUS_SLOT_SIZE` to `STEPPER_FULL_WIDTH`
 * with `overflow: hidden` clipping the rest, revealing the "−"/count from the left. The "−"/count
 * are always mounted (so there's no gap when the count drops back to 0) but only hit-testable via
 * `pointerEvents` while actually in the plate -- `overflow: hidden` in RN clips paint, not touch
 * dispatch, so an always-mounted "−" button behind a narrow clip could otherwise still be tapped
 * through it. */
function PlateAddControl({
  plateEntry,
  item,
  onStep,
  blocksScrollRefs,
  onQuickAdd,
  onHoldStart,
  onHoldDrag,
  onHoldEnd,
  liveCount,
  liveIndex,
}: {
  plateEntry: PlateEntry | undefined;
  item: MenuItem;
  onStep: (delta: number) => void;
  blocksScrollRefs: RefObject<any>[];
  onQuickAdd: () => void;
  onHoldStart: (anchor: { x: number; y: number; width: number; height: number }) => void;
  onHoldDrag: (count: number) => void;
  onHoldEnd: () => void;
  liveCount: SharedValue<number>;
  liveIndex: SharedValue<number>;
}) {
  const inPlate = !!plateEntry;
  const widthProgress = useSharedValue(inPlate ? 1 : 0);
  useEffect(() => {
    widthProgress.value = withTiming(inPlate ? 1 : 0, { duration: durations.servingsPill });
  }, [inPlate, widthProgress]);
  const clipStyle = useAnimatedStyle(() => ({
    width: PLUS_SLOT_SIZE + widthProgress.value * (STEPPER_FULL_WIDTH - PLUS_SLOT_SIZE),
    // The empty-plate "+" is a ghost-outline button (maroon border/text on a see-through
    // background) that was never designed to sit on a filled pill. Fade the fill in alongside the
    // width, rather than always having it, or the outline paints invisible on a solid maroon
    // background while empty.
    backgroundColor: interpolateColor(widthProgress.value, [0, 1], [MAROON_TRANSPARENT, colors.maroon600]),
  }));

  return (
    <Reanimated.View style={[styles.stepperClip, clipStyle]}>
      <View style={styles.stepperRow}>
        <View style={[styles.plusSlot, { width: inPlate ? IN_PLATE_PLUS_WIDTH : PLUS_SLOT_SIZE }]}>
          {inPlate ? (
            <Pressable
              style={[styles.plusSlot, { width: IN_PLATE_PLUS_WIDTH }]}
              onPress={() => onStep(1)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Add one ${item.dishName}`}
            >
              <Text style={styles.stepperButtonText}>+</Text>
            </Pressable>
          ) : (
            <HoldSlideAddButton
              dishName={item.dishName}
              blocksScrollRefs={blocksScrollRefs}
              onQuickAdd={onQuickAdd}
              onHoldStart={onHoldStart}
              onHoldDrag={onHoldDrag}
              onHoldEnd={onHoldEnd}
              liveCount={liveCount}
              liveIndex={liveIndex}
            />
          )}
        </View>
        <Text style={[styles.stepperCount, { width: COUNT_SLOT_WIDTH }]} numberOfLines={1} pointerEvents="none">
          {formatServings(plateEntry?.count ?? 1)}
        </Text>
        <Pressable
          style={[styles.stepperButton, { width: MINUS_SLOT_WIDTH }]}
          onPress={() => onStep(-1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove one ${item.dishName}`}
          pointerEvents={inPlate ? "auto" : "none"}
        >
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
      </View>
    </Reanimated.View>
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
  mealListRef,
  grabListRef,
  holdSlideHostRef,
  dragStateRef,
  liveHoldCount,
  liveHoldIndex,
  setLabelItem,
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
  mealListRef: RefObject<any>;
  grabListRef: RefObject<any>;
  holdSlideHostRef: RefObject<HoldSlideHostHandle | null>;
  dragStateRef: RefObject<{ item: MenuItem } | null>;
  liveHoldCount: SharedValue<number>;
  liveHoldIndex: SharedValue<number>;
  setLabelItem: (item: MenuItem) => void;
}) {
  const dishKey = plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid });
  const plateEntry = plate.find((p) => p.key === dishKey);
  const isFavorite = favoriteDishKeys.has(favoriteKey({ type: "dish", dishName: item.dishName }));
  const expanded = expandedKey === dishKey;
  const macroBadges = menuItemMacroBadges(item, prefs);

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
    <Reanimated.View layout={LinearTransition.duration(durations.rowLayout)} style={[styles.row, (plateEntry || expanded) && styles.rowInPlate]}>
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
                wrapping name that's about to tuck gets one LinearTransition-smoothed reposition
                once measured (the row's Reanimated.View already has `layout={LinearTransition...}`)
                instead -- an acceptable, rare, already-cushioned cost vs. a guaranteed one-frame
                invisibility on every single badged dish. */}
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
              (CafeMenuMixed.dc.html:43), no separate maroon-highlighted price Text. */}
          <Text style={styles.rowCalories}>
            {item.price ? `${item.price} · ` : ""}
            {item.nutrition.calories} cal · {Math.round(item.nutrition.proteinG)}g protein
          </Text>
        </View>
        <PlateAddControl
          plateEntry={plateEntry}
          item={item}
          onStep={(delta) => stepPlateItem(item, delta)}
          blocksScrollRefs={[mealListRef, grabListRef]}
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
        />
      </View>
      {expanded && (
        <Reanimated.View entering={FadeIn.duration(durations.rowExpandIn)} exiting={FadeOut.duration(durations.rowExpandOut)} style={styles.expandedContent} pointerEvents="box-none">
          <View style={styles.expandedDivider} pointerEvents="none" />
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
  /** dev-only: selects a fixture item, see stressFixtureItem above. */
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
  const [selectedDate, setSelectedDate] = useState(() => new Date());
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

  const [plate, setPlate] = useState<PlateEntry[]>([]);
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
  // Refs to both GestureSectionLists, passed to every HoldSlideAddButton so its LongPress can
  // blocksExternalGesture() them -- this native-level relationship (not a reactive scrollEnabled
  // toggle) is what lets the hold-and-drag gesture win against the list's own non-interruptible
  // scroll. Both refs are always passed; only one list is ever mounted for a given row.
  // `any`, not ElementRef<typeof GestureSectionList>: the `as unknown as typeof SectionList` cast
  // above erases MenuItem's generic, so a properly-typed ref doesn't line up with the erased
  // type -- RNGH only needs *some* ref to resolve the underlying native handler tag.
  const mealListRef = useRef<any>(null);
  const grabListRef = useRef<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
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
  const [logged, setLogged] = useState<string | null>(null);
  const [bannerHeight, setBannerHeight] = useState(0);
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
    // hours/address blank, never blocks the menu itself.
    // fetchHoursAndCache (not shared's bare fetchDiningHours), so this screen's own hours get
    // cached too -- otherwise offline recovery (SHOW SAVED COPY) works for the menu while the
    // info sheet right beside it still shows blank hours instead of a cached copy.
    fetchHoursAndCache()
      .then(setHoursFeed)
      .catch(() => {});
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

  // Auto-dismiss the logged banner a few seconds after it appears, or it permanently covers the
  // last menu row until the plate is repopulated.
  useEffect(() => {
    if (!logged) return;
    const timer = setTimeout(() => setLogged(null), 4000);
    return () => clearTimeout(timer);
  }, [logged]);

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
      return [...mealTabs.map((period) => stressFixtureItem(tid, period)), ...filtered];
    }
    return filtered;
  }, [effectiveItems, stationFilter, priceFilter, stressFixture, mealTabs, hall.tid]);
  const sectionsByPeriod = useMemo(() => {
    const map = new Map<MealPeriod, MenuSection[]>();
    for (const period of mealTabs) {
      const sections = sectionsForPeriod(stationPriceFilteredItems, period, prefs);
      // Dev-gated the same way stationPriceFilteredItems's stress-fixture branch above is; see
      // moveSectionToFront's own doc for why this is needed at all (sortStationNames doesn't know
      // about the synthetic "Stress Test" category). A no-op when the section isn't present
      // (stressFixture unset, or hidden by the user's own allergen/diet-tag filters).
      map.set(period, __DEV__ && stressFixture === "long-names" ? moveSectionToFront(sections, "Stress Test") : sections);
    }
    return map;
  }, [stationPriceFilteredItems, mealTabs, prefs, stressFixture]);
  const grabSectionsMemo = useMemo(() => (grabItems ? grabSections(grabItems, prefs) : []), [grabItems, prefs]);
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
  const isSelectedDateToday = selectedDate.toDateString() === now.toDateString();
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

  // Grab tab's own open/closed header line. Only meaningful for today -- get_infov2 (hoursFeed)
  // never publishes anything but today's hours, so showing it against a stepped-to date would
  // paint a confidently wrong "open now · until ..." over a menu that isn't today's; omitted once
  // the date stepper moves off today.
  const grabRetailHours = hoursFeed ? findGrabNGoLocation(hoursFeed.retail, hall.name) : null;
  const grabSubtitle = grabRetailHours && isSelectedDateToday ? retailHeaderSubtitle(retailOpenStatus(grabRetailHours, now)) : "";

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
    const result = await guardedLogPlate(plate, nowLocalIso());
    if (!result) return;
    if (!result.ok) {
      // ponytail: no transaction wrapping the write loop, so a failure partway through leaves
      // whatever already succeeded committed, and the plate stays put (not cleared) so the user
      // doesn't lose their selection -- but retrying re-logs everything with fresh ids
      // (toLogEntries mints new random ids each call), so anything that already committed
      // becomes a duplicate row rather than being replaced. Acceptable for a UI feature where
      // each addEntry is one single-row insert unlikely to fail independently; upgrade to one
      // transactional bulk insert on SqliteLogStorage if this shows up in practice.
      setLogged(`Couldn't log everything: ${String(result.error)}`);
      return;
    }
    setPlate([]);
    setSheetOpen(false);
    setLogged(`Logged ${formatServings(result.count)} ${result.count === 1 ? "item" : "items"}`);
  }

  // Shared by both SectionLists below (the 3 real meal tabs and the Grab tab) -- same dish-row
  // card, same plate/favorite/nutrition-label wiring, regardless of which tid the item came from.
  // useCallback, not a plain function: SectionList treats a changed `renderItem` identity as a
  // reason to re-render its visible rows, so a fresh closure every render was defeating that
  // memoization on all (up to 5) mounted panes on every unrelated state change.
  const renderDishRow = useCallback(
    ({ item }: { item: MenuItem }) => (
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
        mealListRef={mealListRef}
        grabListRef={grabListRef}
        holdSlideHostRef={holdSlideHostRef}
        dragStateRef={dragStateRef}
        liveHoldCount={liveHoldCount}
        liveHoldIndex={liveHoldIndex}
        setLabelItem={setLabelItem}
      />
    ),
    [plate, expandedKey, favoriteDishKeys, prefs, toggleExpanded, toggleDishFavorite, addToPlate, stepPlateItem, liveHoldCount, liveHoldIndex],
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
    const stillLoading = isRealHall ? !items : !cafeState;
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
        ref={mealListRef}
        sections={periodSections}
        keyExtractor={(item, index) => `${item.category}-${item.dishName}-${index}`}
        contentContainerStyle={{ paddingBottom: listBottomPadding(barHeight) + (logged ? bannerHeight : 0) }}
        renderSectionHeader={({ section }) => (
          <Reanimated.View layout={LinearTransition.duration(durations.rowLayout)} style={styles.sectionHeaderWrap}>
            <SectionHeader title={section.title} />
          </Reanimated.View>
        )}
        renderItem={renderDishRow}
        // The standing-menu caveat banner renders in the tab strip's fixed position above (this
        // screen's own render, right below the header), not here as a ListHeaderComponent, so it
        // reads as a persistent state indicator, not scrollable content.
        ListFooterComponent={unmatchedEntries.length > 0 ? () => <UnmatchedMenuBlock entries={unmatchedEntries} onTapItem={openUnmatchedItemSearch} /> : undefined}
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
        ref={grabListRef}
        sections={grabSectionsMemo}
        keyExtractor={(item, index) => `${item.category}-${item.dishName}-${index}`}
        contentContainerStyle={{ paddingBottom: listBottomPadding(barHeight) + (logged ? bannerHeight : 0) }}
        renderSectionHeader={({ section }) => (
          <Reanimated.View layout={LinearTransition.duration(durations.rowLayout)} style={styles.sectionHeaderWrap}>
            <SectionHeader title={section.title} />
          </Reanimated.View>
        )}
        renderItem={renderDishRow}
      />
    );
  }

  return (
    <View style={styles.container}>
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
      {selectedMeal === "grab" && grabSubtitle ? <Text style={styles.headerSubtitle}>{grabSubtitle}</Text> : null}

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
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{cafeMealTabLabel(period, isRealHall, isBrunchToday)}</Text>
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
        <MealTabPager
          activeIndex={activeIndex}
          onActiveIndexChange={handleActiveIndexChange}
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
      )}
      {logged && (
        // This banner is the one surface a LOG failure actually shows on (the plate is
        // deliberately retained, not cleared, so the bar stays mounted right where an in-flow
        // bottom banner would otherwise sit, opaque and on top of it). Anchored clear of the
        // bar's measured height via the same listBottomPadding reuse -- 0 when there's no bar,
        // right above it when there is. Also pads for the bottom safe-area inset itself (else its
        // own text gets clipped by gesture nav when there's no bar to already clear that space),
        // and reports its own measured height via onLayout so the list's paddingBottom above can
        // add it in while it's showing.
        <Reanimated.View
          entering={FadeInDown.duration(durations.loggedBannerIn)}
          exiting={FadeOutDown.duration(durations.loggedBannerOut)}
          style={[styles.loggedBanner, { position: "absolute", left: 0, right: 0, bottom: listBottomPadding(barHeight), paddingBottom: spacing(2) + insets.bottom }]}
          onLayout={(e) => setBannerHeight(e.nativeEvent.layout.height)}
        >
          <Text style={styles.loggedBannerText}>{logged}</Text>
        </Reanimated.View>
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
      <PlateSheet
        // Never both visible=true at once: Android silently drops a 2nd simultaneous native Modal.
        visible={resolvePlateAndCustomFoodVisibility(sheetOpen, customFoodFormOpen).plateSheetVisible}
        plate={plate}
        totals={totals}
        contextLabel={hall.name}
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
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body400 },
  // Info-only state -- CafeSheet's content, scrollable in place of the tab pager.
  infoScroll: { flex: 1 },
  skeletonList: { paddingHorizontal: spacing(5), paddingTop: spacing(3), gap: spacing(2) },
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

  // Grab tab's own open/closed line -- ported from the retired grab-n-go/[slug].tsx.
  headerSubtitle: {
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(1.5),
    fontFamily: fonts.body400,
    fontSize: fs(12),
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
  stepperClip: { overflow: "hidden", alignItems: "flex-end", borderRadius: radii.pill },
  stepperRow: { flexDirection: "row-reverse", alignItems: "center", width: STEPPER_FULL_WIDTH },
  // No static `width` -- it differs by state (PLUS_SLOT_SIZE vs IN_PLATE_PLUS_WIDTH, see #413),
  // applied inline at each usage.
  plusSlot: { height: PLUS_SLOT_SIZE, alignItems: "center", justifyContent: "center" },
  stepperButton: { height: fs(44), alignItems: "center", justifyContent: "center" },
  stepperButtonText: { fontSize: fs(18), color: colors.paper50 },
  stepperCount: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600", textAlign: "center", color: colors.paper50 },

  loggedBanner: { backgroundColor: colors.maroon900, padding: spacing(2) },
  loggedBannerText: { color: colors.paper50, textAlign: "center", fontFamily: fonts.body400, fontSize: fs(13) },
});
