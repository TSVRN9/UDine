import {
  computeDailyTotals,
  currentMealPeriod,
  DINING_HALLS,
  fetchEvents,
  favoriteKey,
  GRAB_N_GO_TIDS,
  menuItemMacroBadges,
  menuItemMatchesPreferences,
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
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
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
import Svg, { Path, Rect } from "react-native-svg";
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
  directionsUrl,
  formatDateStepperLabel,
  formatServingSummary,
  hallInfoGrabNGoWindow,
  hallInfoHoursRows,
  isCurrentTabLoading,
  MEAL_TABS,
  shouldAutoCorrectMealTab,
  stepDate,
  toggleExpandedKey,
} from "../../lib/hallMenuTabs";
import { deriveCafeMealTabs, pickCafeMenuHtml, resolveCafeMenuState, syntheticHallTidForName, type CafeMenuState, type StandingMenuEntry } from "../../lib/cafeMenu";
import { getCachedDishCatalog, refreshDishCatalogIfStale, type CachedDishCatalog } from "../../lib/dishCatalog";
import { grabSections, sectionsForPeriod, type MenuSection } from "../../lib/hallMenuSections";
import { findGrabNGoLocation } from "../../lib/grabStrip";
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
import { getPreferences, setPreferences } from "../../lib/preferences";
import { formatServings, MIN_DRAG_SERVINGS } from "../../lib/servingsStepper";
import { nowLocalIso } from "../../lib/date";
import { SqliteLogStorage } from "../../lib/sqliteStorage";

// react-native-gesture-handler doesn't export a gesture-aware SectionList (only ScrollView/FlatList
// wrap createNativeWrapper for you) -- a plain RN SectionList nested under MealTabPager's
// GestureDetector doesn't participate in RNGH's native touch arbitration, so its own scroll can
// steal the touch mid-drag and cancel an in-progress pane swipe. Same fix RNGH's own ScrollView/
// FlatList use internally, applied directly since SectionList has no built-in equivalent.
const GestureSectionList = createNativeWrapper(SectionList, {
  disallowInterruption: true,
  shouldCancelWhenOutside: false,
}) as unknown as typeof SectionList;

/** A hall-menu-screen subject: a real DINING_HALLS entry (`slug` present -- gets Grab 'N Go +
 * the fixed 4-tab MEAL_TABS + the "being served now" subtitle) or a café (#177 -- `slug` absent,
 * meal tabs derived from whatever the fetched items actually carry, per deriveCafeMealTabs). */
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

// #91 rebuild: dish rows now feed an in-memory "plate" (steppers) instead of a single-selection log
// bar, plus a full nutrition-label screen. Both the plate's expanded sheet and the label are RN
// <Modal>s rendered from this screen, not routed Stack.Screens — MenuItem doesn't need to survive a
// round-trip through router search params (Expo Router params are strings only), and neither needs
// a back-stack entry of its own. Register in _layout.tsx only if that changes.

/** Tab selection: the 4 real meal periods, or the Grab 'N Go tab -- Grab isn't a `MealPeriod` on
 * this hall's own menu (its items fetch from a different tid, `GRAB_N_GO_TIDS`, and come back
 * tagged with ordinary breakfast/lunch/etc. mealPeriod values, never a distinct "grab" one -- see
 * the sections memo below), so it's a sibling of MealPeriod, not a member of it. */
type TabSelection = MealPeriod | "grab";

/** Bag/takeout glyph for the Grab 'N Go tab (artboard spec: "bag icon, same muted ink as the other
 * inactive tabs"). A real react-native-svg icon, not a Unicode stand-in -- emoji is out per
 * CLAUDE.md and the app previously had no SVG dependency at all; this is that dependency's first
 * use, added deliberately for this tab (see #336-era comment this replaces). */
function GrabBagIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M7 9V6a5 5 0 0 1 10 0v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M5 9h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 9Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

/** menu-filters-macros: a single-letter circular badge (thin gold stroke, matching this file's
 * existing icon/chip palette) for one enabled macro preset -- deliberately not a hand-drawn per-
 * preset SVG glyph (5 distinct icons with no design asset to match would be guessing); the letter is
 * distinct per preset and accessibilityLabel carries the full name for anyone not just eyeballing it. */
const MACRO_BADGE_GLYPH: Record<MacroPreset, string> = {
  "high-protein": "P",
  "low-sodium": "S",
  "under-500-cal": "C",
  "low-fat": "L",
  "high-fiber": "F",
};

function MacroBadgeIcon({ preset }: { preset: MacroPreset }) {
  return (
    <View style={styles.macroBadge} accessibilityLabel={MACRO_PRESET_LABELS[preset]}>
      <Text style={styles.macroBadgeText}>{MACRO_BADGE_GLYPH[preset]}</Text>
    </View>
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

/** Magnifying-glass glyph for an unmatched standing-menu row (café-screen QA fix, bug 3) -- same
 * thin-stroke style as GrabBagIcon/FilterGlyphIcon above. Replaces the plain `›` chevron those rows
 * used to render, which read no differently from a matched dish row's own affordance; this one
 * signals "tap to search," not "tap to add." */
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

/** Café-screen unification: a "standing" state's unmatched rows (parseRetailMenuHtml items with no
 * catalog match) -- name+price only, no nutrition to show or plate/log directly. Tapping one opens
 * the plate sheet's search pre-filled with its own name instead of being a dead end (see
 * openUnmatchedItemSearch/PlateSheet's own `initialQuery`). Rendered as the meal pane's
 * ListFooterComponent (mealPane above), not mixed into `sections` -- these aren't MenuItems, so
 * they don't fit hallMenuSections.ts's per-station MenuSection shape.
 *
 * Café-screen QA fix (bug 3): these rows used to be visually identical to a real, matched dish row
 * (solid divider, plain `›` chevron) except by tapping one -- nothing on screen distinguished "this
 * is a name UMass Dining published with no nutrition behind it yet" from a normal loggable dish.
 * Dashed border + a magnifying-glass icon (not the add-icon a real row gets) + explicit "Nutrition
 * not found" text now mark that difference structurally, not just by behavior. */
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
          // Café-screen QA fix (bug 3): an explicit accessibilityLabel on a Pressable suppresses
          // announcement of its own child Text nodes on a screen reader -- without "nutrition not
          // found" folded in here too, this row's whole visual point (bug 3 is specifically about
          // marking "not a real, loggable dish yet") would be silent for anyone not sighted.
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
// stepper's own plus segment is narrower (IN_PLATE_PLUS_WIDTH below) -- #413 found these two
// states were sharing one size ("so the pill's right edge doesn't jump" when the two swap), but
// the artboards draw them at different widths; the slot's height and its pinned-right position
// (see PlateAddControl's own doc comment) stay shared, only the width differs per state now, a
// 4px shift on the add/remove transition.
const PLUS_SLOT_SIZE = fs(44);
// Literal, not fs(40) -- spec (ServingsF.dc.html:58/60/96/98) pins the in-plate stepper's +/-
// segments at 40px each; touch targets don't scale (see fs()'s own doc comment). Distinct from
// PLUS_SLOT_SIZE (44px), which is the standalone empty-plate "+" circle only -- #413.
const IN_PLATE_PLUS_WIDTH = 40;
// Literal, not fs(40) -- spec (ServingsF.dc.html:58) pins the minus slot at 40px; touch targets
// don't scale (see fs()'s own doc comment).
const MINUS_SLOT_WIDTH = 40;
const COUNT_SLOT_WIDTH = fs(34);
// Precomputed outside the worklet below -- withOpacity isn't itself worklet-marked, and calling
// a plain JS-thread function from inside useAnimatedStyle's UI-thread callback throws ("Tried to
// synchronously call a Remote Function," caught on-device). Worklets can close over a plain
// string constant fine; they just can't call out to arbitrary JS to compute one per frame.
const MAROON_TRANSPARENT = withOpacity(colors.maroon600, 0);
const STEPPER_FULL_WIDTH = IN_PLATE_PLUS_WIDTH + COUNT_SLOT_WIDTH + MINUS_SLOT_WIDTH;

/** Filled maroon pill — the dish row's add control, both the empty-plate "+" and the in-plate
 * "− N +" stepper are the SAME persistent element, not two components swapped by a ternary. The
 * "+" slot (`flexDirection: row-reverse`, so it's the first child but renders pinned to the right)
 * never moves; growing the pill is just animating this wrapper's `width` from `PLUS_SLOT_SIZE` up
 * to `STEPPER_FULL_WIDTH` with `overflow: hidden` clipping the rest -- the "−"/count portion is
 * revealed from the left as the clip widens, which is what "the left edge of the + expands out"
 * (review feedback) actually means: a single directional reveal anchored at the button's own
 * fixed right edge, not two views crossfading at different rects (the previous attempt: a
 * layout-tracked wrapper around a ternary-swapped `+`/stepper, which read as a hard swap with a
 * resize animated on top rather than one continuous grow). The "−"/count are always mounted (never
 * conditionally, so there's no gap between removing them and the clip re-narrowing when the count
 * drops back to 0) but only ever hit-testable via `pointerEvents` while actually in the plate --
 * `overflow: hidden` in RN clips paint, not touch dispatch, so an always-mounted "−" button behind
 * a narrow clip could otherwise still be tapped through it. */
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
    // background, matching HoldSlideAddButton's own standalone styling) -- it was never designed
    // to sit on a filled pill. Fading the fill in alongside the width, rather than always having
    // it, keeps that outline visible while empty instead of painting maroon text/border directly
    // on top of a solid maroon background (on-device catch: the + was completely invisible).
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

export function HallMenuScreenBody({ hall, initialMeal }: { hall: HallMenuSubject; initialMeal?: TabSelection }) {
  const isRealHall = hall.slug !== undefined;
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // #181: retry card + "SHOW SAVED COPY" wiring. retryToken is bumped by TRY AGAIN to re-run the
  // fetch effect below without duplicating its fetch logic; cachedMenu is looked up whenever the
  // fetch fails, so the retry card knows whether a saved copy actually exists (spec: the link only
  // renders "when a cache exists").
  const [retryToken, setRetryToken] = useState(0);
  const [cachedMenu, setCachedMenu] = useState<CachedMenu | null>(null);
  // Café-screen unification: the local dish-catalog cache, read once for the waterfall's tier-2
  // standing-menu-item matching (resolveCafeMenuState) -- café only, a real hall never needs it.
  // `catalogLoaded` (not just `catalog !== null`, which a genuinely-empty local cache can't be told
  // apart from "hasn't read yet") gates cafeState below so the FIRST paint of a standing menu
  // already reflects whatever's cached, instead of painting every row unmatched for one frame and
  // then flipping some to matched the instant this resolves (it's a local SQLite read, fast, but
  // still async).
  const [catalog, setCatalog] = useState<CachedDishCatalog | null>(null);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  // Café info-only state's PDF affordance -- same in-app viewer CafeSheet always opened, just
  // mounted here instead of from index.tsx (see CafeSheet's own doc comment on why).
  const [cafePdf, setCafePdf] = useState<{ url: string; label: string } | null>(null);
  // An unmatched standing-menu row's tap seeds this, then opens the plate sheet with it -- see
  // PlateSheet's own `initialQuery` doc. Cleared the moment the sheet closes (below) so a later
  // plain PlateBar tap doesn't reseed a stale query.
  const [plateSearchSeed, setPlateSearchSeed] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<FoodPreferences>({ allergensToAvoid: [], requiredDietTags: [] });
  const [favoriteDishKeys, setFavoriteDishKeys] = useState<Set<string>>(new Set());
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  // #117: static default rather than deriving from hoursFeed's currentMealPeriod on load -- hours
  // arrive async, and auto-jumping the tab out from under a user who already tapped one would be
  // worse than a fixed starting point.
  // ponytail: doesn't auto-select "whatever's being served now" the way Home's hero does; upgrade
  // to that once hoursFeed's initial load has a place to land it without racing a manual tap.
  //
  // #177: a café has no fixed "lunch" tab to default to (People's Organic only ever has "allday") --
  // null here means "not yet chosen," resolved once items load by the effect below, to whichever
  // period deriveCafeMealTabs finds first. A real hall keeps the static "lunch" default unchanged.
  const [selectedMeal, setSelectedMeal] = useState<TabSelection | null>(initialMeal ?? (isRealHall ? "lunch" : null));
  // Tracks whether the user has manually picked a meal tab -- seeded true when initialMeal was
  // explicitly passed via route params (today, only the Grab 'N Go deep link), since that's already
  // an explicit choice that must never be overridden by the current-meal-period auto-select effect
  // below. Not state: flipping it must never itself trigger a re-render.
  const hasManuallyPickedMeal = useRef(initialMeal !== undefined);
  // Set true right before the current-meal auto-correction effect below calls setSelectedMeal, so
  // MealTabPager snaps to it instead of visibly swiping through the tabs in between (#117 follow-up
  // -- see that effect's own comment). Never set for a real user swipe/tap, which goes through
  // handleActiveIndexChange instead and always keeps its tween.
  const mealTabInstantRef = useRef(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  // Café-screen unification review finding: a locationId-less café (hall.tid undefined) used to
  // share a single `-1` sentinel hallTid across every such café -- harmless while that state never
  // mounted PlateSheet, wrong now that it does (every locationId-less café's logged dishes and
  // "recent history" search would conflate into one identity, and none would ever get a real
  // display name). syntheticHallTidForName gives each a distinct, stable per-name number instead --
  // see its own doc comment (cafeMenu.ts) and retailHallNames.ts's matching recordRetailNames fix.
  const cafeHallTid = hall.tid ?? syntheticHallTidForName(hall.name);

  // Café-screen unification: the local dish-catalog cache, read once on mount -- café only (a real
  // hall's `mealTabs`/sections never touch it). Fire-and-forget background refresh alongside it,
  // same call PlateSheet.tsx's own mount-time refresh already makes -- this is a SECOND read of the
  // same cache, not a duplicated sync; refreshDishCatalogIfStale is itself a no-op unless the local
  // copy is actually stale.
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

  // The waterfall's own decision (resolveCafeMenuState, cafeMenu.ts) -- null while still unresolved
  // (real hall, ajax fetch still in flight, or the catalog read above hasn't settled yet), otherwise
  // exactly one of integrated/standing/info. Every mealPane/render-time consumer below reads THIS,
  // never `items` directly, once it's a café -- `items` alone can't tell "still loading" apart from
  // "ajax genuinely came back empty, waterfall fell through to tier 2/3".
  //
  // `error` (a REJECTED ajax fetch, not just an empty result) is treated as "no ajax items" here,
  // same as a genuinely empty result -- `items ?? []` falls through to the standing/info tiers off
  // `hall.retailLoc` alone, which need no network beyond the hours feed already in hand. Pre-
  // unification, this exact case (a locationId whose probe rejected) already degraded to the
  // fallback sheet rather than an error screen (see cafe/[name].tsx's own #243 bug C comment on the
  // pre-unification version of this file) -- this is that same call, just made HERE now that both
  // outcomes render from inside this one component instead of two. `items === null && !error` is
  // "still in flight," the one case this must NOT resolve for.
  const cafeState = useMemo<CafeMenuState | null>(() => {
    if (isRealHall || !catalogLoaded) return null;
    if (items === null && !error) return null;
    return resolveCafeMenuState(items ?? [], hall.retailLoc ? pickCafeMenuHtml(hall.retailLoc) : null, catalog, cafeHallTid, selectedDate);
  }, [isRealHall, items, error, catalogLoaded, catalog, hall.retailLoc, cafeHallTid, selectedDate]);

  // Café-screen QA fix (bug 5): while the waterfall is still resolving (cafeState null below), the
  // loading skeleton unconditionally assumed the "integrated" shape (dish rows + filter FAB) --
  // correct for that one outcome, but the more common real-world outcome for a café (this
  // investigation's own confirmed examples: babyBerk/Commonwealth -> info, Argo Tea/Yum! Bakery ->
  // standing) swaps the ENTIRE shape out the instant cafeState resolves. `hall.retailLoc`'s
  // standing-menu HTML is already in hand at MOUNT (resolved by cafe/[name].tsx before this screen
  // ever renders -- see HallMenuSubject's own doc), so parsing it here costs nothing extra and
  // predicts "not integrated, and no item list either" (i.e. "info") correctly whenever the ajax
  // probe (tier 1, the one genuinely un-predictable network call) turns out empty -- the common
  // case. It can't rule out a genuine "integrated" café ahead of that network call landing (ajax
  // non-empty overrides both other tiers regardless of what retailLoc parses to -- see
  // resolveCafeMenuState's own tier order), but getting that one case "wrong" just means the dish
  // rows/FAB APPEAR once ajax resolves, not disappear -- a smaller, less jarring change than the
  // reverse. Standing-vs-integrated is deliberately NOT distinguished here (both keep the filter
  // FAB and a dish-row-shaped skeleton is a reasonable stand-in for either) -- fully shape-matching
  // "standing"'s own flat-list-no-tabs layout ahead of time would need a second dedicated skeleton
  // shape, a larger change than this fix pass; noted as a follow-up, not attempted here.
  const cafeSkeletonLooksLikeInfo = useMemo(() => {
    if (isRealHall || !hall.retailLoc) return false;
    return parseRetailMenuHtml(pickCafeMenuHtml(hall.retailLoc)).kind !== "items";
  }, [isRealHall, hall.retailLoc]);

  const mealTabs = useMemo<readonly MealPeriod[]>(() => {
    if (isRealHall) return MEAL_TABS;
    if (!cafeState) return [];
    if (cafeState.kind === "integrated") return deriveCafeMealTabs(cafeState.items);
    // "standing" is always exactly one synthetic "allday" tab (#175's "daily offerings" convention,
    // same as an integrated café whose own items never split into breakfast/lunch/dinner) --
    // "info" has no tabs at all, its own top-level render branch below replaces the tab pager
    // entirely rather than showing an empty one.
    return cafeState.kind === "standing" ? (["allday"] as const) : [];
  }, [isRealHall, cafeState]);

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
  // hall's own menu (see TabSelection's doc). Fetched lazily: only once the Grab tab is actually
  // selected, not on every hall-screen mount, so browsing a hall that never opens Grab costs no
  // extra network call. Re-fires on a date step while the tab is active; shared's fetchMenu already
  // holds a 30-min in-memory cache, so flipping tabs away and back without changing the date is a
  // cheap cache hit, not a fresh request.
  const [grabItems, setGrabItems] = useState<MenuItem[] | null>(null);
  const [grabError, setGrabError] = useState<string | null>(null);

  const [plate, setPlate] = useState<PlateEntry[]>([]);
  // Hold-and-drag add (canvas: "F: inline vertical slide"). The live count/ladder-position/cancel
  // state during a drag are Reanimated shared values, not React state -- HoldSlideAddButton writes
  // them directly from its UI-thread gesture worklet (see its own doc comment), and the overlay
  // reads them the same way, so a drag never triggers a React re-render of anything up here.
  // holdSlideHostRef mounts/unmounts the overlay itself (see HoldSlideHost below) via an
  // imperative ref instead of state living in THIS component -- this component is the one that
  // owns the whole dish-list SectionList, and re-rendering it on every drag step (which state
  // here would do) used to force the SectionList to re-render every visible row on every touch-
  // move frame, the dominant remaining cause of "still feels slow" after the per-frame bridge-
  // crossing fix. The item being committed on release lives in dragStateRef, read there rather
  // than closed-over state so onHoldEnd never risks acting on a stale render's item.
  const liveHoldCount = useSharedValue(MIN_DRAG_SERVINGS);
  const liveHoldIndex = useSharedValue(0);
  const holdSlideHostRef = useRef<HoldSlideHostHandle>(null);
  const dragStateRef = useRef<{ item: MenuItem } | null>(null);
  // Refs to both GestureSectionLists, passed to every HoldSlideAddButton so its LongPress can
  // blocksExternalGesture() them -- see that component's own doc comment for why this native-
  // level relationship (not a reactive scrollEnabled toggle, which was tried first and confirmed
  // too slow on-device) is what actually lets the hold-and-drag gesture win against the list's
  // own deliberately non-interruptible scroll. Both refs are always passed; only one list is ever
  // mounted-and-relevant for a given row, the other's ref is simply unattached and ignored.
  // `any`, not ElementRef<typeof GestureSectionList>: GestureSectionList's `as unknown as typeof
  // SectionList` cast (above) erases MenuItem's generic, so a properly-typed ref for a
  // MenuItem-specialized SectionList doesn't line up with the erased type -- RNGH only needs
  // *some* ref to resolve against the underlying native handler tag at gesture-attach time.
  const mealListRef = useRef<any>(null);
  const grabListRef = useRef<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // #180: separate from `sheetOpen` above (the Plate sheet) -- the two are independent modals, a
  // user could in principle have tapped the title before opening the plate. `events` is separate
  // from `hoursFeed`'s own load below because it comes from a different endpoint
  // (get_beacons_events vs get_infov2) -- see HallInfoSheet's own doc for why it's unfiltered by
  // hall despite the "per-hall events" framing.
  const [infoSheetOpen, setInfoSheetOpen] = useState(false);
  // Menu-filters-macros: FilterSheet's own open state, plus its two ephemeral (never persisted,
  // "this menu only") refinements -- reset on every reopen isn't needed here since these are plain
  // local state that starts empty each mount and Clear All resets explicitly; nothing else writes them.
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [stationFilter, setStationFilter] = useState<Set<string>>(new Set());
  const [priceFilter, setPriceFilter] = useState<Set<PriceBucket>>(new Set());
  const [events, setEvents] = useState<DiningEvent[]>([]);
  const [labelItem, setLabelItem] = useState<MenuItem | null>(null);
  // PlateSheet's search-result confirm step and "create a custom food" row (#91 follow-on) --
  // rendered as siblings of PlateSheet's own <Modal>, not nested inside it: no precedent in this
  // codebase for a Modal mounted inside another Modal, and this file's own note above (near the
  // Modal usages) already documents why each sheet has to manage its own native host.
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
    // it (mobile/grab-n-go-menu's "clear stale menu error on date change" fix is the same class).
    let current = true;
    setItems(null);
    setError(null);
    setCachedMenu(null);
    const tid = hall.tid;
    if (tid === undefined) {
      // Café-screen unification: no locationId at all (see HallMenuSubject's own doc) -- there's no
      // tid to ever probe fetchMenu with, straight to the waterfall's standing/info tiers off
      // hall.retailLoc alone (cafeState below), same as an ajax call that genuinely came back empty.
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
        // #181: only looked up on failure, not eagerly on every load -- the retry card is the only
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

  // #177: a café's initial tab can't be a static default (see selectedMeal's own comment) -- once
  // mealTabs resolves (café-screen unification: driven by cafeState now, not raw `items.length` --
  // an all-unmatched "standing" state still gets its one "allday" tab even though its OWN items
  // (effectiveItems, matched-only) are empty), land on whichever period comes first. A manual tab
  // choice survives stepping the date, same as a real hall's -- UNLESS the new date's derived tab set
  // no longer contains it (a café's mealTabs is per-day, not fixed like a real hall's MEAL_TABS): PR
  // review finding, a stale selectedMeal pointing at a period the new date doesn't serve used to
  // fall back silently to tab index 0 (Math.max(0, tabs.indexOf(-1)) below) while selectedMeal
  // itself still held the old, now-absent value -- rendering tab 0's real dishes with NO tab
  // pill highlighted (active = period === selectedMeal never matched anything), instead of the
  // honest "no menu for this period" empty state a stale selection showed before this pager existed.
  useEffect(() => {
    if (isRealHall || mealTabs.length === 0) return;
    if (selectedMeal !== null && mealTabs.includes(selectedMeal as MealPeriod)) return;
    const firstTab = mealTabs[0];
    if (firstTab) setSelectedMeal(firstTab);
  }, [isRealHall, selectedMeal, mealTabs]);

  // Expanded state keys on dish identity alone (hallTid + dishName, via plateKeyFor), not meal
  // period or date -- the same dish name can recur across meals/days, so without this a card
  // expanded at Lunch could render pre-expanded after switching to Dinner or stepping the date.
  useEffect(() => {
    setExpandedKeys(new Set());
  }, [selectedMeal, selectedDate]);

  useEffect(() => {
    if (!hall) return;
    // removed in #180) -- real halls only (see the header render's own #219-review comment on why
    // the sheet itself doesn't exist for a café). Independent of selectedDate: hours reflect what's
    // true right now, not the date being browsed. A failure here just leaves the sheet's
    // hours/address blank, never blocks the menu itself.
    // #181 review finding 10: fetchHoursAndCache (not shared's bare fetchDiningHours) -- otherwise
    // this screen's own hours never get cached, so offline on the hall-menu screen recovers the
    // menu (SHOW SAVED COPY) while the #180 info sheet right beside it still shows "Address
    // unavailable" and every window "not served here" instead of the cached hours it could have had.
    fetchHoursAndCache()
      .then(setHoursFeed)
      .catch(() => {});
  }, [hall]);

  useEffect(() => {
    if (!hall) return;
    // #180: hall-info sheet's events row. Same unfiltered list for every hall -- see
    // HallInfoSheet's own doc for why get_beacons_events can't be filtered per-hall. A failure here
    // just leaves the row on its empty-state copy, never blocks the sheet.
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

  // Device-pass finding: the logged banner never dismissed on its own, permanently covering the
  // last menu row until the plate was repopulated. Auto-dismiss a few seconds after it appears.
  useEffect(() => {
    if (!logged) return;
    const timer = setTimeout(() => setLogged(null), 4000);
    return () => clearTimeout(timer);
  }, [logged]);

  // Sections are stations (the foodpro category names). For the 3 real meal tabs, that's a single
  // meal period's worth of items (meal periods are the tab row above, so a given render only ever
  // shows one meal at all). Grab 'N Go has no meal-period concept of its own -- its items come back
  // tagged with ordinary breakfast/lunch/etc. values with no filtering by any of them -- and needs a
  // dedup step the other tabs don't: the same dish can appear twice under two different mealPeriod
  // values sharing one trimmed category, which would otherwise put two identical rows sharing one
  // plate stepper in the same section (ported from the retired grab-n-go/[slug].tsx, #130 item 3).
  // Every mounted pane computes its own sections (not just whichever tab is selected) so the swipe
  // pager's windowed neighbors have real content to crossfade, not a placeholder -- pulled out to
  // lib/hallMenuSections.ts (sectionsForPeriod/grabSections) so it's pure/testable and shared.
  // Station/price are ephemeral, "this menu only" refinements (menu-filters-macros) -- filtered in
  // HERE, before hallMenuSections.ts's own sectionsForPeriod/grabSections, which stays
  // allergens/diet-tags only per CLAUDE.md (macros/station/price never exclude anything there).
  // Grab 'N Go items are deliberately EXCLUDED from this filter: FilterSheet's "Stations Here"
  // checklist is built from `items` (this hall's own menu) only, not `grabItems` (a different tid,
  // fetched lazily only once the Grab tab is opened) -- station-filtering Grab against a checklist
  // that never lists Grab's own categories would silently empty that tab with no checkbox to undo it.
  // effectiveItems (café-screen unification), not `items` directly -- a café's own matched-standing
  // synthetic items need the exact same station/price/macro filtering a real hall's items get; see
  // effectiveItems' own doc comment above.
  const stationPriceFilteredItems = useMemo(
    () => effectiveItems.filter((i) => itemMatchesStationAndPriceFilter(i, stationFilter, priceFilter)),
    [effectiveItems, stationFilter, priceFilter],
  );
  const sectionsByPeriod = useMemo(() => {
    const map = new Map<MealPeriod, MenuSection[]>();
    for (const period of mealTabs) map.set(period, sectionsForPeriod(stationPriceFilteredItems, period, prefs));
    return map;
  }, [stationPriceFilteredItems, mealTabs, prefs]);
  const grabSectionsMemo = useMemo(() => (grabItems ? grabSections(grabItems, prefs) : []), [grabItems, prefs]);
  // FAB state (menu-filters-macros): driven ONLY by allergens/diet-tags currently hiding something --
  // macros never filter, so they never drive this, same derivation web's +page.svelte already uses
  // (data.items.filter(i => !menuItemMatchesPreferences(i, prefs)).length), on the UNFILTERED item
  // list (station/price selections must not change what the badge reports).
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
  // below degrades to [] and grabNGoWindow's lookup degrades to null for one, harmlessly (#219
  // review: the café header renders no glyph/sheet at all, so neither is ever read for a café, but
  // computing them unconditionally here keeps this block matching #180's own shape).
  // #180: hall-info sheet's data. All computed here (not inside HallInfoSheet) so the sheet stays a
  // pure presentational component -- hoursRows in particular needs `new Date()` at render time for
  // its NOW-highlight, same "now" this screen already reads once per render, nowhere else.
  // Known gap (PR review): this is read once per RENDER, not on an interval -- if the sheet is left
  // open across a meal boundary (e.g. lunch ending at 2:30 PM) with no other state change to trigger
  // a re-render, the NOW pill goes stale until something else re-renders the screen. Not fixed here;
  // would need a ticking interval/timer while infoSheetOpen is true.
  const now = new Date();
  const hoursRows = hallHours ? hallInfoHoursRows(hallHours, now) : [];
  const grabNGoWindow = hoursFeed ? hallInfoGrabNGoWindow(hoursFeed.retail, hall.name) : null;
  const infoDirectionsUrl = directionsUrl(hallHours?.mapAddress);

  // #117 follow-up: a real hall's initial tab was hardcoded "lunch" regardless of what's actually
  // being served right now. Resolves once hallHours loads (fires once in the normal case -- hallHours
  // above only changes once per hall once hoursFeed resolves), landing on the current meal period
  // instead -- but only if the user hasn't already manually picked a tab (hasManuallyPickedMeal is a
  // ref, not state, so this effect doesn't need it in its dependency list). useLayoutEffect (not
  // useEffect) so the correction commits before the browser/native paint of THIS render -- but
  // hallHours itself only ever arrives via fetchHoursAndCache's async fetch, so this effect
  // necessarily fires on a LATER render, after the interim "lunch" default has already painted once.
  // mealTabInstantRef (set below, read by MealTabPager) is what actually keeps that correction from
  // reading as a visible swipe through the tabs in between -- useLayoutEffect alone doesn't prevent
  // the flash, it just avoids adding a synchronous extra one on top of the async one.
  useLayoutEffect(() => {
    if (!isRealHall || hasManuallyPickedMeal.current || !hallHours) return;
    const period = currentMealPeriod(hallHours, new Date());
    // shouldAutoCorrectMealTab (hallMenuTabs.ts) owns the two-part guard's reasoning -- pulled out
    // as a pure predicate so it's unit-testable without mounting this screen or fighting Jest's
    // react-native-reanimated mock (see its own doc comment).
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

  // Grab tab's own open/closed header line (ported from the retired grab-n-go/[slug].tsx). Only
  // meaningful for today -- get_infov2 (hoursFeed) never publishes anything but today's hours, so
  // showing it against a stepped-to date would paint a confidently wrong "open now · until ..." over
  // a menu that isn't today's; omitted once the date stepper moves off today, same call the retired
  // screen made (matching #117's sibling mealTabSubtitle for the same reason).
  const grabRetailHours = hoursFeed ? findGrabNGoLocation(hoursFeed.retail, hall.name) : null;
  const isSelectedDateToday = selectedDate.toDateString() === now.toDateString();
  const grabSubtitle = grabRetailHours && isSelectedDateToday ? retailHeaderSubtitle(retailOpenStatus(grabRetailHours, now)) : "";

  // Whichever tab is currently selected, not always the hall's own -- the plate bar's empty-state
  // copy (below) needs to know if THIS tab's own list has loaded, not just the hall's. Error takes
  // priority over loading: a failed fetch leaves `items`/`grabItems` permanently null, so without
  // this a fetch failure would forever read as "still loading" instead of "failed". `isRealHall &&`
  // on the plain `error` half -- a café's rejected ajax fetch is folded into `cafeState` (falls
  // through to the standing/info tiers), never surfaced as an error to the plate bar either; a real
  // hall has no such fallback, so its own error still drives this.
  const currentTabError = selectedMeal === "grab" ? grabError : isRealHall && error;
  // isCurrentTabLoading (hallMenuTabs.ts): pulled out as a pure predicate -- see its own doc comment
  // on why the info-only café case needs its OWN branch instead of reusing the real-hall/other-café
  // "selectedMeal === null" check (café-screen QA fix, bug 1).
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
    setExpandedKeys((prev) => toggleExpandedKey(prev, key));
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

  // Single dispatch point for adding any of PlateSheet's 4 merged-search result kinds (#91
  // follow-on: replaces the old addOffResult/addHistoryDish pair, which had no natural home for a
  // 3rd/4th source) -- what the search-result confirm step's NutritionLabel.onAddToPlate calls.
  function addSearchResult(result: PlateSearchResult, count: number) {
    setPlate((p) => addOrIncrement(p, plateSearchResultToPlateEntry(result, count)));
  }

  // Café-screen unification: tapping an unmatched standing-menu row (UnmatchedMenuBlock, mealPane
  // above) -- opens the plate sheet's "add something else" search pre-filled with the item's own
  // name (PlateSheet's own `initialQuery`), instead of leaving it a dead end.
  function openUnmatchedItemSearch(name: string) {
    setPlateSearchSeed(name);
    setSheetOpen(true);
  }

  async function logPlate() {
    // #147: guarded by useGuardedLogPlate -- drops a second tap that lands before this one's
    // sequential addEntry() writes finish, instead of re-running
    // toLogEntries (fresh ids) and duplicating every row. Also drops a tap landing on an
    // already-emptied plate (the "Logged 0 items" symptom). Local-date-prefixed loggedAt, not
    // `.toISOString()` (UTC) -- see nowLocalIso's own comment (issue #111: evening logs were filing
    // under tomorrow's UTC date and vanishing from Today).
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
  // memoization on all (up to 5) mounted panes on every unrelated state change -- part of the
  // same JS-thread-congestion bug behind the swipe desync (see the pager's own note above).
  const renderDishRow = useCallback(({ item }: { item: MenuItem }) => {
    const dishKey = plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid });
    const plateEntry = plate.find((p) => p.key === dishKey);
    const isFavorite = favoriteDishKeys.has(favoriteKey({ type: "dish", dishName: item.dishName }));
    const expanded = expandedKeys.has(dishKey);
    const macroBadges = menuItemMacroBadges(item, prefs);
    return (
      // #117: whole card is tappable and expands in place -- the (i) info button is gone,
      // replaced by this and the FULL NUTRITION LABEL link below. The expand toggle is a
      // SIBLING absolute-fill Pressable, not a parent of the star/stepper/add/label-link
      // Pressables -- index.tsx's HallCard already flagged why: "targets don't nest --
      // nested Pressables in RN double-fire/steal gestures." Purely-visual children get
      // pointerEvents="none"/"box-none" so a tap not on one of the real controls falls
      // through to this background Pressable instead of being silently swallowed.
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
            <Text style={styles.rowText}>{item.dishName}</Text>
            {/* #378 (CafeMenuMixed.dc.html:43): price folds into the same uniform-color meta
                string as cal/protein, no separate maroon-highlighted price Text -- was two
                differently-styled Texts (rowPrice/rowCalories) that no longer matches spec. */}
            <View style={styles.rowMetaLine}>
              <Text style={styles.rowCalories}>
                {item.price ? `${item.price} · ` : ""}
                {item.nutrition.calories} cal · {Math.round(item.nutrition.proteinG)}g protein
              </Text>
              {macroBadges.length > 0 && (
                <View style={styles.macroBadgeRow}>
                  {macroBadges.map((preset) => (
                    <MacroBadgeIcon key={preset} preset={preset} />
                  ))}
                </View>
              )}
            </View>
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
              // 0 is the drag's cancel rung (CANCEL_SERVINGS), never a real add -- see
              // servingsStepper.ts's own doc comment.
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
  }, [plate, expandedKeys, favoriteDishKeys, prefs, toggleExpanded, toggleDishFavorite, addToPlate, stepPlateItem, liveHoldCount, liveHoldIndex]);

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
  // Created here, not inside MealTabPager, so the tab row's own AnimatedTabUnderline (below) can
  // read the exact same live drag/settle position the pager's pane crossfade uses -- same
  // "parent creates the shared value, children read it as a prop" shape as HoldSlideHost earlier
  // this session. Initial value only (useSharedValue's argument is read once, on first mount).
  const tabPanePos = useSharedValue(activeIndex);

  // One real meal period's pane -- reproduces the pre-swipe non-Grab branch verbatim, just
  // parameterized by which period this pane is for instead of reading selectedMeal globally. Error/
  // loading checks stay per-pane (not hoisted above the pager): `items`/`error` are hall-global, so
  // every meal pane agrees regardless -- but Grab's own pane below is checked independently, so it
  // stays reachable even when the hall's regular menu fetch failed, same as it is today.
  //
  // A plain function CALLED to produce JSX, not a component TAGGED as JSX (`mealPane(period)`, not
  // `<MealPane period={period} />`) -- tagging it would redeclare a fresh function/type identity on
  // every HallMenuScreenBody render (this function is defined inside the body, closing over
  // items/prefs/etc.), and React reconciles by element type: a changed type unmounts and remounts
  // the whole subtree instead of re-rendering it. That would tear down and rebuild each pane's real
  // SectionList (losing scroll position, replaying its mount) on every parent re-render -- a plate
  // tap, an expand toggle, a layout measurement, anything. Calling it as a function returns the same
  // *kind* of stable element (SectionList/View/EmptyState) React already knows how to reconcile.
  function mealPane(period: MealPeriod) {
    const periodSections = sectionsByPeriod.get(period) ?? [];
    // Café-screen unification: a "standing" state's UNMATCHED rows (parseRetailMenuHtml items with
    // no catalog hit) never make it into `sectionsByPeriod` -- they aren't MenuItems (no nutrition/
    // allergens to group by station), so they can't fit hallMenuSections.ts's per-category
    // MenuSection shape. Rendered as this SectionList's own ListFooterComponent instead, below.
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
    // `items` can stay `null` forever on a REJECTED ajax fetch even after `cafeState` has already
    // resolved via the fallback (see cafeState's own doc comment on folding `error` into it), so
    // gating on `!items` for a café would skeleton-lock a standing/integrated state that's already
    // fully resolved and ready to render.
    const stillLoading = isRealHall ? !items : !cafeState;
    if (stillLoading || selectedMeal === null) {
      // #181: honest skeleton -- header + meal tabs above already rendered fully (known without
      // the network); only the dish list itself is unknown, so only it shimmers. Widths vary a
      // little (canvas: "96-176px") so it doesn't read as a uniform grid.
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
    // unmatchedEntries.length > 0 keeps an all-unmatched standing menu (nothing the catalog has ever
    // seen -- e.g. a café whose whole menu is drinks) OUT of the empty state: every row still shows,
    // just without nutrition, instead of an honest-but-wrong "No matching dishes".
    if (periodSections.length === 0 && unmatchedEntries.length === 0) {
      // #117 review: was hardcoded "today" regardless of the stepped date -- "for this day"
      // matches grab-n-go/[slug].tsx's own EmptyState copy (also date-agnostic by construction,
      // so it's correct whether selectedDate is today or not, no isToday branch needed).
      return <EmptyState title="No matching dishes" message={`No ${cafeMealTabLabel(period, isRealHall).toLowerCase()} menu matches your filters at ${hall.name} for this day.`} />;
    }
    return (
      <GestureSectionList
        ref={mealListRef}
        sections={periodSections}
        keyExtractor={(item, index) => `${item.category}-${item.dishName}-${index}`}
        contentContainerStyle={{ paddingBottom: listBottomPadding(barHeight) + (logged ? bannerHeight : 0) }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderWrap}>
            <SectionHeader title={section.title} />
          </View>
        )}
        renderItem={renderDishRow}
        // Café-screen QA fix (bug 2): the standing-menu caveat banner used to render here, as this
        // list's own ListHeaderComponent -- moved to the tab strip's fixed position above (see this
        // screen's own render, right below the header) so it reads as a persistent state indicator,
        // not scrollable list content that disappears as soon as the user scrolls past it.
        ListFooterComponent={unmatchedEntries.length > 0 ? () => <UnmatchedMenuBlock entries={unmatchedEntries} onTapItem={openUnmatchedItemSearch} /> : undefined}
      />
    );
  }

  // Grab 'N Go's pane -- reproduces the pre-swipe Grab branch verbatim. When mounted as a windowed
  // neighbor before it's ever been selected, grabItems is still null, so this naturally shows the
  // same loading skeleton it always has between a tap/swipe-commit and the fetch resolving -- no new
  // "unselected Grab" state to invent, and no eager fetch (see the lazy-fetch effect above, still
  // gated on selectedMeal === "grab" alone, unchanged by any of this).
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
          <View style={styles.sectionHeaderWrap}>
            <SectionHeader title={section.title} />
          </View>
        )}
        renderItem={renderDishRow}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing(4.5) }]}>
        <View style={styles.headerLeft}>
          {/* #180: back chevron is a SIBLING of the title-tap Pressable below, not nested inside
          it -- same "targets don't nest" rule the dish-card expand/star/stepper Pressables already
          follow (see this file's dish-row comment): a Pressable inside another Pressable
          double-fires/steals gestures in RN. */}
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          {/* #219 review (post-#207 rebase): #207's title-tap (i) hall-info sheet is REAL-HALL ONLY.
          The earlier version of this fix pass added a DECORATIVE café ⓘ glyph here (before #180 had
          merged) -- now that #207/#180 is in, that decorative glyph is retracted in favor of this
          resolution: `HallInfoSheet`'s data model doesn't have a sensible café equivalent.
          `hallInfoHoursRows` needs a `DiningHallHours` (breakfast/lunch/dinner/latenight, each its
          own window); `RetailLocationHours` (what a café actually has) carries one single `hours:
          TimeWindow | null` for the whole day, no per-meal breakdown to build real hoursRows from.
          The sheet's title caption is also hardcoded "Dining Commons", wrong copy for a café.
          Building a real café equivalent (a different hours-card shape, different caption, an
          events-relevance story) is a new feature, out of this fix pass's scope -- so cafés get NO
          glyph and NO sheet at all here, not a decorative one sitting next to a real, functional
          one on the same component. */}
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
              {/* Bare 13px stroke-circle hint, not a bordered-button circle (owner rejected the 30px/
              22px circle variants) -- turns gold while the sheet it opens is showing. */}
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

      {/* Café-screen QA fix (bug 2): a "standing" state has no real MealPeriod to build tabs from --
      deriveCafeMealTabs' own "allday" synthetic tab (the "daily offerings" convention) rendered as a
      degenerate single-tab strip ("ALL DAY"), which the approved design says shouldn't exist for
      this state at all. The caveat banner (formerly the meal pane's own ListHeaderComponent, see
      mealPane below) takes the tab strip's exact place instead -- same fixed position, not scrolled
      away with the list. */}
      {!isRealHall && cafeState?.kind === "standing" ? (
        // PR review (post-QA-fix pass): the tab strip it replaces carried its own bottom divider
        // (tabRow's borderBottomWidth) separating the header from whatever's below -- without an
        // equivalent here, this banner butted directly against the header with no divider at all.
        // Same divider treatment, wrapped around the banner instead of styled onto tabRow itself.
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
                accessibilityLabel={`${cafeMealTabLabel(period, isRealHall)} menu`}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{cafeMealTabLabel(period, isRealHall)}</Text>
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
          {/* Grab 'N Go is a hall-only 5th tab (its own station, not a MealPeriod) -- cafés have no
              slug and no such station, per the issue's "stations/FDA/plate/logging/ranking unchanged"
              for the menu path plus its own "meal tabs only for periods the café actually has." */}
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
        // Café-screen unification's third internal state: the waterfall found nothing loggable at
        // all (no ajax items, no standing-menu item list -- maybe a PDF, maybe nothing) -- content
        // ONLY, no tab pager, mounted directly in this same screen rather than a separate Modal/
        // route (see CafeSheet's own doc comment on why this used to be exactly that). The
        // `hall.retailLoc` guard is defensive, not a real branch -- cafe/[name].tsx always resolves
        // and passes it before this screen ever mounts for a café; if it's somehow absent this just
        // falls through to the skeleton below instead of crashing on a missing prop.
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
        // the dish-catalog read still in flight -- see cafeState's own comment) -- same honest
        // skeleton the non-Grab branch below shows once there IS at least one tab, shown directly
        // here without mounting a 0-pane pager.
        //
        // Café-screen QA fix (bug 5): cafeSkeletonLooksLikeInfo predicts this café won't have dish
        // rows or a filter FAB at all once it resolves -- a neutral spinner-only placeholder instead
        // of the dish-row skeleton, rather than committing to a shape that's about to disappear.
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
            // SectionList element tree; building all (up to 5) on every render, including every
            // swipe commit's own re-render, was slow enough to widen the JS-thread window
            // MealTabPager's rapid-reversal-commit guard (its own doc comment on
            // committedIndexRef) depends on staying narrow -- confirmed as the cause of the
            // menu/tab-label/underline desync on fast back-and-forth swiping, not just visible
            // jank.
            if (Math.abs(i - activeIndex) > 1) return null;
            return tab === "grab" ? grabPane() : mealPane(tab);
          })}
          instantRef={mealTabInstantRef}
          panePos={tabPanePos}
        />
      )}
      {logged && (
        // Same occlusion-bug class as the list's own bottom padding above (PR #78/#84): this banner
        // is the one surface a LOG failure actually shows on (the plate is deliberately retained, not
        // cleared, so the bar stays mounted right where an in-flow bottom banner would otherwise sit,
        // opaque and on top of it). Anchored clear of the bar's measured height via the same
        // listBottomPadding reuse -- 0 when there's no bar, right above it when there is. Device-pass
        // finding: also pads for the bottom safe-area inset itself (else its own text gets clipped by
        // gesture nav when there's no bar to already clear that space), and reports its own measured
        // height via onLayout so the list's paddingBottom above can add it in while it's showing.
        <Reanimated.View
          entering={FadeInDown.duration(durations.loggedBannerIn)}
          exiting={FadeOutDown.duration(durations.loggedBannerOut)}
          style={[styles.loggedBanner, { position: "absolute", left: 0, right: 0, bottom: listBottomPadding(barHeight), paddingBottom: spacing(2) + insets.bottom }]}
          onLayout={(e) => setBannerHeight(e.nativeEvent.layout.height)}
        >
          <Text style={styles.loggedBannerText}>{logged}</Text>
        </Reanimated.View>
      )}
      {/* Menu-filters-macros: permanent, in-context filter FAB -- pinned above the plate bar (48x48,
      right:20/bottom:108 per the canvas). Bare/inactive when nothing's currently hidden; dark-filled
      with a gold hidden-count badge once allergens/diet-tags are excluding something (macros never
      drive this -- see hiddenCount's own comment above). Opens FilterSheet in place, no navigation.
      Café-screen unification: hidden entirely for the info-only state -- effectiveItems is always
      [] there, so there is nothing for it to ever filter. Café-screen QA fix (bug 5): also hidden
      while STILL RESOLVING if cafeSkeletonLooksLikeInfo predicts "info" -- see that memo's own
      comment on why showing it now just to hide it again a moment later is the more jarring order. */}
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
        // Always mounted now (not just while the plate has items, still loading, or errored) --
        // the bar is the only way to open the plate sheet, and the sheet's OFF search is exactly
        // how something not on the menu (a grabbed piece of fruit, say) gets logged when nothing
        // else is staged. #181: "visible-but-disabled" while loading, "survives" (functional look,
        // just a reassurance sub-line) on a fetch failure -- only the loading LOG button is spec'd
        // disabled. All three are no-ops once the plate has real items (see PlateBar's own doc): a
        // populated plate always shows the normal bar regardless of tab/fetch state.
        emptyState={
          currentTabLoading
            ? { subline: "add dishes once the menu loads", disabled: true }
            : currentTabError
              ? { subline: "your plate is safe — it lives on this phone" }
              : { subline: "search for something not on the menu" }
        }
      />
      <PlateSheet
        // #436: never both visible=true at once -- see resolvePlateAndCustomFoodVisibility's own
        // doc (lib/plate.ts) for why (Android silently drops a 2nd simultaneous native Modal).
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
        // #362 review (non-blocking finding 3): Grab's own sections are never station/price-filtered
        // (see grabSectionsMemo's own comment above) -- hide those two controls while on the Grab tab
        // instead of showing ones that would silently do nothing until switching tabs.
        stationsPriceDisabled={selectedMeal === "grab"}
        hiddenCount={hiddenCount}
        onClose={() => setFilterSheetOpen(false)}
      />
      {/* Real-hall only -- see the header render's own comment on why a café has no glyph to open
      this from at all. `infoSheetOpen` can never become true for a café since no Pressable ever
      sets it there, but not mounting the sheet for one at all is the clearer signal. */}
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
          subtitle={`${hall.name} · ${labelItem.category}`}
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
      {/* PlateSheet's search-result confirm step (#91 follow-on) -- a 2nd NutritionLabel instance,
      siblings not nested (see searchDetailResult's own doc above). Reuses the same generic
      component unmodified: plateSearchResultDetail (lib/plate.ts) maps any of the 4
      PlateSearchResult kinds onto NutritionLabel's props, same as labelItem's MenuItem does above. */}
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
        // #436, same resolver as PlateSheet's `visible` above -- CustomFoodForm always wins.
        visible={resolvePlateAndCustomFoodVisibility(sheetOpen, customFoodFormOpen).customFoodFormVisible}
        initialName={customFoodFormPrefill}
        customFoodsStorage={customFoodsStorage}
        onSaved={() => setCustomFoodFormOpen(false)}
        onClose={() => setCustomFoodFormOpen(false)}
      />
      <HoldSlideHost ref={holdSlideHostRef} liveIndex={liveHoldIndex} />
      {/* Café-screen unification: the info-only state's PDF affordance (CafeSheet above) --
      mounted here, alongside this screen's own NutritionLabel/FilterSheet/etc. modals, instead of
      from index.tsx (see CafeSheet's own doc comment on why that used to be a separate code path). */}
      {cafePdf ? <CafePdfViewer url={cafePdf.url} label={cafePdf.label} cafeName={hall.name} onClose={() => setCafePdf(null)} /> : null}
    </View>
  );
}

/** `/halls/[slug]` route: resolves the slug against DINING_HALLS and hands off to the shared body
 * above. #177's `/cafe/[name]` route is the other caller of HallMenuScreenBody, for the
 * non-empty-fetchMenu branch of its own runtime model — same screen, a café's {tid, name} with no
 * slug. */
export default function HallMenuScreen() {
  // `meal` is the retired /grab-n-go/[slug] route's replacement deep link (grabRouteFor,
  // lib/grabStrip.ts): "grab" preselects the Grab 'N Go tab instead of pushing a separate screen.
  // Any other/missing value falls through to the normal default (isRealHall ? "lunch" : null).
  const { slug, meal } = useLocalSearchParams<{ slug: string; meal?: string }>();
  const hall = DINING_HALLS.find((h) => h.slug === slug);
  // #284 nit 2: only reachable via a crafted deep link (no in-app path produces an unknown slug),
  // but a dead end with no way back is still a bug -- same back-chevron affordance every other
  // header-less route in this file already draws.
  if (!hall)
    return (
      <View style={styles.container}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.error}>Unknown dining hall</Text>
      </View>
    );
  return <HallMenuScreenBody hall={hall} initialMeal={meal === "grab" ? "grab" : undefined} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream100 },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body400 },
  // Café-screen unification's info-only state -- CafeSheet's content, scrollable in place of the
  // tab pager.
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
  // #180: the whole title group (name + (i) hint) is one tap zone opening the hall-info sheet.
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

  // Café-screen unification: standing-menu caveat banner + unmatched-item block, same visual
  // language CafeSheet's own (now-retired) menu card used.
  //
  // Café-screen QA fix (bug 2): standingMenuBannerWrap takes the tab strip's exact place (see this
  // screen's own render) -- same bottom divider (borderBottomWidth/borderColor) tabRow carried, so
  // the header-to-content transition reads the same regardless of which of the two this café shows.
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
  // Café-screen QA fix (bug 3): dashed border (not the matched dish rows' solid divider/card look)
  // -- a structural, always-visible cue that this row is "unconfirmed," not just a plainer dish row.
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
  rowText: { fontSize: fs(14), fontFamily: fonts.body600, color: colors.ink900 },
  rowMetaLine: { flexDirection: "row", alignItems: "baseline", gap: spacing(2) },
  rowCalories: { fontSize: fs(12), fontFamily: fonts.mono, color: withOpacity(colors.ink900, 60) },
  macroBadgeRow: { flexDirection: "row", gap: spacing(1) },
  macroBadge: { width: fs(15), height: fs(15), borderRadius: fs(15) / 2, borderWidth: 1, borderColor: colors.gold500, alignItems: "center", justifyContent: "center" },
  macroBadgeText: { fontSize: fs(8), fontFamily: fonts.mono, fontWeight: "700", color: colors.maroon600 },
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
