import {
  computeDailyTotals,
  DINING_HALLS,
  fetchEvents,
  favoriteKey,
  GRAB_N_GO_TIDS,
  type DiningEvent,
  type DiningHoursFeed,
  type Favorite,
  type FoodPreferences,
  type MealPeriod,
  type MenuItem,
  type OffSearchResult,
} from "@udine/shared";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { DishCardSkeleton, Spinner, StationHeaderSkeleton } from "../../components/Skeleton";
import { EmptyState, SectionHeader } from "../../components/ui";
import { HallInfoSheet } from "../../components/HallInfoSheet";
import { MealTabPager } from "../../components/MealTabPager";
import { MenuErrorCard } from "../../components/MenuErrorCard";
import { NutritionLabel } from "../../components/NutritionLabel";
import { PlateBar } from "../../components/PlateBar";
import { PlateSheet } from "../../components/PlateSheet";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../../lib/theme";
import { formatTime, retailHeaderSubtitle, retailOpenStatus } from "../../lib/homeHero";
import {
  directionsUrl,
  formatDateStepperLabel,
  formatServingSummary,
  hallInfoGrabNGoWindow,
  hallInfoHoursRows,
  MEAL_TABS,
  mealTabLabel,
  stepDate,
  toggleExpandedKey,
} from "../../lib/hallMenuTabs";
import { deriveCafeMealTabs } from "../../lib/cafeMenu";
import { grabSections, sectionsForPeriod, type MenuSection } from "../../lib/hallMenuSections";
import { findGrabNGoLocation } from "../../lib/grabStrip";
import { SqliteFavoritesStorage, useGuardedToggleFavorite } from "../../lib/favoritesStorage";
import type { HistoryDish } from "../../lib/dishHistory";
import { fetchMenuAndRecordSeen } from "../../lib/menuFetchWithSeenTracking";
import { fetchHoursAndCache, getCachedMenu, type CachedMenu } from "../../lib/menuHoursCache";
import {
  addOrIncrement,
  historyDishToPlateEntry,
  listBottomPadding,
  menuItemToPlateEntry,
  offResultToPlateEntry,
  plateKeyFor,
  stepCount,
  toLogEntries,
  totalItemCount,
  totalPlatePrice,
  useGuardedLogPlate,
  type PlateEntry,
} from "../../lib/plate";
import { getPreferences } from "../../lib/preferences";
import { nowLocalIso } from "../../lib/date";
import { SqliteLogStorage } from "../../lib/sqliteStorage";

/** A hall-menu-screen subject: a real DINING_HALLS entry (`slug` present -- gets Grab 'N Go +
 * the fixed 4-tab MEAL_TABS + the "being served now" subtitle) or a café (#177 -- `slug` absent,
 * meal tabs derived from whatever the fetched items actually carry, per deriveCafeMealTabs). */
export interface HallMenuSubject {
  tid: number;
  name: string;
  slug?: string;
}

const storage = new SqliteLogStorage();
const favoritesStorage = new SqliteFavoritesStorage();

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

/** Filled maroon pill stepper — the canvas's in-plate control on a dish row. */
function RowStepper({ count, dishName, onStep }: { count: number; dishName: string; onStep: (delta: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepperButton} onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel={`Remove one ${dishName}`}>
        <Text style={styles.stepperButtonText}>−</Text>
      </Pressable>
      <Text style={styles.stepperCount}>{count}</Text>
      <Pressable style={styles.stepperButton} onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel={`Add one ${dishName}`}>
        <Text style={styles.stepperButtonText}>+</Text>
      </Pressable>
    </View>
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
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const mealTabs = useMemo<readonly MealPeriod[]>(() => (isRealHall ? MEAL_TABS : deriveCafeMealTabs(items ?? [])), [isRealHall, items]);

  // Grab 'N Go's own items -- a different tid (GRAB_N_GO_TIDS), not a MealPeriod filter on this
  // hall's own menu (see TabSelection's doc). Fetched lazily: only once the Grab tab is actually
  // selected, not on every hall-screen mount, so browsing a hall that never opens Grab costs no
  // extra network call. Re-fires on a date step while the tab is active; shared's fetchMenu already
  // holds a 30-min in-memory cache, so flipping tabs away and back without changing the date is a
  // cheap cache hit, not a fresh request.
  const [grabItems, setGrabItems] = useState<MenuItem[] | null>(null);
  const [grabError, setGrabError] = useState<string | null>(null);

  const [plate, setPlate] = useState<PlateEntry[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  // #180: separate from `sheetOpen` above (the Plate sheet) -- the two are independent modals, a
  // user could in principle have tapped the title before opening the plate. `events` is separate
  // from `hoursFeed`'s own load below because it comes from a different endpoint
  // (get_beacons_events vs get_infov2) -- see HallInfoSheet's own doc for why it's unfiltered by
  // hall despite the "per-hall events" framing.
  const [infoSheetOpen, setInfoSheetOpen] = useState(false);
  const [events, setEvents] = useState<DiningEvent[]>([]);
  const [labelItem, setLabelItem] = useState<MenuItem | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const [logged, setLogged] = useState<string | null>(null);
  const [bannerHeight, setBannerHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const guardedLogPlate = useGuardedLogPlate(storage);
  const guardedToggleFavorite = useGuardedToggleFavorite(favoritesStorage, (favs) => setFavoriteDishKeys(new Set(favs.filter((f) => f.type === "dish").map(favoriteKey))));

  useEffect(() => {
    // `current` guards against a stale response winning a race: two quick date-stepper taps fire
    // two fetches, and network order isn't request order -- without this, an in-flight response
    // for a date the user already stepped away from can land after the current one and overwrite
    // it (mobile/grab-n-go-menu's "clear stale menu error on date change" fix is the same class).
    let current = true;
    setItems(null);
    setError(null);
    setCachedMenu(null);
    fetchMenuAndRecordSeen(hall.tid, selectedDate)
      .then((result) => {
        if (current) setItems(result);
      })
      .catch((e) => {
        if (!current) return;
        setError(String(e));
        // #181: only looked up on failure, not eagerly on every load -- the retry card is the only
        // place this matters, and it doesn't exist until there's an error to show it in.
        getCachedMenu(hall.tid, selectedDate)
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

  function retryMenuFetch() {
    setRetryToken((t) => t + 1);
  }

  function showSavedCopy() {
    if (!cachedMenu) return;
    setItems(cachedMenu.items);
    setError(null);
  }

  // #177: a café's initial tab can't be a static default (see selectedMeal's own comment) -- once
  // items load, land on whichever period deriveCafeMealTabs finds first. A manual tab choice
  // survives stepping the date, same as a real hall's -- UNLESS the new date's derived tab set no
  // longer contains it (a café's mealTabs is per-day, not fixed like a real hall's MEAL_TABS): PR
  // review finding, a stale selectedMeal pointing at a period the new date doesn't serve used to
  // fall back silently to tab index 0 (Math.max(0, tabs.indexOf(-1)) below) while selectedMeal
  // itself still held the old, now-absent value -- rendering tab 0's real dishes with NO tab
  // pill highlighted (active = period === selectedMeal never matched anything), instead of the
  // honest "no menu for this period" empty state a stale selection showed before this pager existed.
  useEffect(() => {
    if (isRealHall || !items || items.length === 0) return;
    if (selectedMeal !== null && mealTabs.includes(selectedMeal as MealPeriod)) return;
    const firstTab = mealTabs[0];
    if (firstTab) setSelectedMeal(firstTab);
  }, [isRealHall, selectedMeal, items, mealTabs]);

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
  const sectionsByPeriod = useMemo(() => {
    const map = new Map<MealPeriod, MenuSection[]>();
    for (const period of mealTabs) map.set(period, sectionsForPeriod(items ?? [], period, prefs));
    return map;
  }, [items, mealTabs, prefs]);
  const grabSectionsMemo = useMemo(() => (grabItems ? grabSections(grabItems, prefs) : []), [grabItems, prefs]);

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
  // this a fetch failure would forever read as "still loading" instead of "failed".
  const currentTabError = selectedMeal === "grab" ? grabError : error;
  const currentTabLoading = !currentTabError && (selectedMeal === "grab" ? !grabItems : !items || selectedMeal === null);

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => toggleExpandedKey(prev, key));
  }

  // #198: guarded per dish key -- see useGuardedToggleFavorite's own doc comment for why a rapid
  // second tap on the same star must be dropped, not re-decided from stale state.
  async function toggleDishFavorite(dishName: string) {
    const favorite: Favorite = { type: "dish", dishName };
    await guardedToggleFavorite(favorite, favoriteDishKeys.has(favoriteKey(favorite)));
  }

  function addToPlate(item: MenuItem, count = 1) {
    setPlate((p) => {
      let next = p;
      for (let i = 0; i < count; i++) next = addOrIncrement(next, menuItemToPlateEntry(item));
      return next;
    });
  }

  function stepPlateItem(item: MenuItem, delta: number) {
    setPlate((p) => stepCount(p, plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid }), delta));
  }

  function addOffResult(result: OffSearchResult) {
    setPlate((p) => addOrIncrement(p, offResultToPlateEntry(result)));
  }

  function addHistoryDish(dish: HistoryDish) {
    setPlate((p) => addOrIncrement(p, historyDishToPlateEntry(dish)));
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
    setLogged(`Logged ${result.count} ${result.count === 1 ? "item" : "items"}`);
  }

  // Shared by both SectionLists below (the 3 real meal tabs and the Grab tab) -- same dish-row
  // card, same plate/favorite/nutrition-label wiring, regardless of which tid the item came from.
  function renderDishRow({ item }: { item: MenuItem }) {
    const dishKey = plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid });
    const plateEntry = plate.find((p) => p.key === dishKey);
    const isFavorite = favoriteDishKeys.has(favoriteKey({ type: "dish", dishName: item.dishName }));
    const expanded = expandedKeys.has(dishKey);
    return (
      // #117: whole card is tappable and expands in place -- the (i) info button is gone,
      // replaced by this and the FULL NUTRITION LABEL link below. The expand toggle is a
      // SIBLING absolute-fill Pressable, not a parent of the star/stepper/add/label-link
      // Pressables -- index.tsx's HallCard already flagged why: "targets don't nest --
      // nested Pressables in RN double-fire/steal gestures." Purely-visual children get
      // pointerEvents="none"/"box-none" so a tap not on one of the real controls falls
      // through to this background Pressable instead of being silently swallowed.
      <View style={[styles.row, (plateEntry || expanded) && styles.rowInPlate]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => toggleExpanded(dishKey)}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${item.dishName}`}
        />
        <View style={styles.rowMainLine} pointerEvents="box-none">
          <Pressable
            onPress={() => toggleDishFavorite(item.dishName)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${isFavorite ? "Unfavorite" : "Favorite"} ${item.dishName}`}
          >
            <Text style={[styles.star, isFavorite && styles.starActive]}>{isFavorite ? "★" : "☆"}</Text>
          </Pressable>
          <View style={styles.rowMain} pointerEvents="none">
            <Text style={styles.rowText}>{item.dishName}</Text>
            {/* #177 styling spec: price leads the meta line, same row as cal/protein, gap
                8px. No price in the data (every hall dish, most café dishes) -- renders
                exactly as today, a single Text with no price chip. */}
            <View style={styles.rowMetaLine}>
              {item.price ? <Text style={styles.rowPrice}>{item.price}</Text> : null}
              <Text style={styles.rowCalories}>
                {item.nutrition.calories} cal · {Math.round(item.nutrition.proteinG)}g protein
              </Text>
            </View>
          </View>
          {plateEntry ? (
            <RowStepper count={plateEntry.count} dishName={item.dishName} onStep={(delta) => stepPlateItem(item, delta)} />
          ) : (
            <Pressable style={styles.addButton} onPress={() => addToPlate(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add ${item.dishName} to plate`}>
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          )}
        </View>
        {expanded && (
          <View style={styles.expandedContent} pointerEvents="box-none">
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
          </View>
        )}
      </View>
    );
  }

  // Grab isn't in `mealTabs` (see TabSelection's own doc) -- appended as the swipeable sequence's
  // last item for a real hall only, matching the tab row's own rendering order below. `tabs`/
  // `activeIndex` are local to this screen; MealTabPager never sees TabSelection/MealPeriod/"grab",
  // just an index.
  const tabs: readonly TabSelection[] = isRealHall ? [...mealTabs, "grab" as const] : mealTabs;
  // -1 guard covers the café pre-load instant (selectedMeal still null, see its own comment above).
  const activeIndex = Math.max(0, tabs.indexOf(selectedMeal as TabSelection));
  function handleActiveIndexChange(i: number) {
    setSelectedMeal(tabs[i]);
  }

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
    if (error) {
      return <MenuErrorCard savedCopyTime={cachedMenu ? formatTime(new Date(cachedMenu.fetchedAt)) : null} onRetry={retryMenuFetch} onShowSavedCopy={showSavedCopy} />;
    }
    if (!items || selectedMeal === null) {
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
    if (periodSections.length === 0) {
      // #117 review: was hardcoded "today" regardless of the stepped date -- "for this day"
      // matches grab-n-go/[slug].tsx's own EmptyState copy (also date-agnostic by construction,
      // so it's correct whether selectedDate is today or not, no isToday branch needed).
      return <EmptyState title="No matching dishes" message={`No ${mealTabLabel(period).toLowerCase()} menu matches your filters at ${hall.name} for this day.`} />;
    }
    return (
      <SectionList
        sections={periodSections}
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
      <SectionList
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

      <View style={styles.tabRow}>
        {mealTabs.map((period) => {
          const active = period === selectedMeal;
          return (
            <Pressable
              key={period}
              onPress={() => setSelectedMeal(period)}
              hitSlop={12}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityLabel={`${mealTabLabel(period)} menu`}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{mealTabLabel(period)}</Text>
              <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
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
              onPress={() => setSelectedMeal("grab")}
              hitSlop={12}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityLabel={`${hall.name} Grab 'N Go menu`}
            >
              <View style={styles.tabIconRow}>
                <GrabBagIcon color={selectedMeal === "grab" ? colors.maroon900 : withOpacity(colors.ink900, 45)} />
                <Text style={[styles.tabText, selectedMeal === "grab" && styles.tabTextActive]}>Grab &apos;N Go</Text>
              </View>
              <View style={[styles.tabUnderline, selectedMeal === "grab" && styles.tabUnderlineActive]} />
            </Pressable>
          </>
        ) : null}
      </View>

      {tabs.length === 0 ? (
        // Café pre-load: deriveCafeMealTabs hasn't found a first tab yet (see the effect above that
        // resolves selectedMeal once items load) -- same honest skeleton the non-Grab branch below
        // shows once there IS at least one tab, shown directly here without mounting a 0-pane pager.
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
      ) : (
        <MealTabPager
          activeIndex={activeIndex}
          onActiveIndexChange={handleActiveIndexChange}
          panes={tabs.map((tab) => (tab === "grab" ? grabPane() : mealPane(tab)))}
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
        <View
          style={[styles.loggedBanner, { position: "absolute", left: 0, right: 0, bottom: listBottomPadding(barHeight), paddingBottom: spacing(2) + insets.bottom }]}
          onLayout={(e) => setBannerHeight(e.nativeEvent.layout.height)}
        >
          <Text style={styles.loggedBannerText}>{logged}</Text>
        </View>
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
        visible={sheetOpen}
        plate={plate}
        totals={totals}
        contextLabel={hall.name}
        logStorage={storage}
        onStep={(key, delta) => setPlate((p) => stepCount(p, key, delta))}
        onAddOffResult={addOffResult}
        onAddHistoryDish={addHistoryDish}
        onLog={logPlate}
        onClose={() => setSheetOpen(false)}
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
          onAddToPlate={(count) => {
            addToPlate(labelItem, count);
            setLabelItem(null);
          }}
          onClose={() => setLabelItem(null)}
        />
      )}
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
  tabUnderline: { height: 3, width: "100%", marginTop: spacing(1), backgroundColor: "transparent", borderRadius: 2 },
  tabUnderlineActive: { backgroundColor: colors.gold500 },
  tabSpacer: { flexGrow: 1 },
  tabDivider: { width: 1, height: fs(16), backgroundColor: withOpacity(colors.ink900, 20) },

  sectionHeaderWrap: {
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
    paddingBottom: spacing(2),
    backgroundColor: colors.cream100,
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
  rowPrice: { fontSize: fs(12), fontFamily: fonts.mono, fontWeight: "600", color: colors.maroon600 },
  rowCalories: { fontSize: fs(12), fontFamily: fonts.mono, color: withOpacity(colors.ink900, 60) },
  star: { fontSize: fs(20), color: withOpacity(colors.ink900, 30) },
  starActive: { color: colors.gold500 },

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

  addButton: {
    width: fs(44),
    height: fs(44),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { fontSize: fs(20), color: colors.maroon600, lineHeight: fs(22) },

  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: colors.maroon600, borderRadius: radii.pill },
  stepperButton: { width: fs(34), height: fs(44), alignItems: "center", justifyContent: "center" },
  stepperButtonText: { fontSize: fs(18), color: colors.paper50 },
  stepperCount: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600", minWidth: 16, textAlign: "center", color: colors.paper50 },

  loggedBanner: { backgroundColor: colors.maroon900, padding: spacing(2) },
  loggedBannerText: { color: colors.paper50, textAlign: "center", fontFamily: fonts.body400, fontSize: fs(13) },
});
