import {
  computeDailyTotals,
  DINING_HALLS,
  fetchDiningHours,
  fetchMenu,
  favoriteKey,
  GRAB_N_GO_TIDS,
  menuItemMatchesPreferences,
  type DiningHoursFeed,
  type Favorite,
  type FoodPreferences,
  type MenuItem,
  type OffSearchResult,
} from "@udine/shared";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, SectionHeader } from "../../components/ui";
import { NutritionLabel } from "../../components/NutritionLabel";
import { PlateBar } from "../../components/PlateBar";
import { PlateSheet } from "../../components/PlateSheet";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../../lib/theme";
import { retailHeaderSubtitle, retailOpenStatus } from "../../lib/homeHero";
import { findGrabNGoLocation } from "../../lib/grabStrip";
import { SqliteFavoritesStorage } from "../../lib/favoritesStorage";
import {
  addOrIncrement,
  listBottomPadding,
  menuItemToPlateEntry,
  offResultToPlateEntry,
  plateKeyFor,
  stepCount,
  toLogEntries,
  totalItemCount,
  useGuardedLogPlate,
  type PlateEntry,
} from "../../lib/plate";
import { getPreferences } from "../../lib/preferences";
import { SqliteLogStorage } from "../../lib/sqliteStorage";
import { nowLocalIso } from "../../lib/date";

const storage = new SqliteLogStorage();
const favoritesStorage = new SqliteFavoritesStorage();

// #115: Grab 'N Go's own screen, all-day (no meal tabs) and station-grouped instead of meal-period
// grouped. Reuses every component/lib the hall-menu screen (halls/[slug].tsx) uses for its dish
// rows/plate/nutrition label -- do not fork those, #117 is reworking the hall-menu screen's header
// in parallel and a forked copy here would only need re-merging. The date stepper below is new UI
// specific to this screen (the hall-menu screen doesn't have one yet), so it stays local rather than
// becoming a shared component that could collide with #117's own header work.

function addDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function formatStepperDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** 30px circled chevron per the canvas date-stepper spec. */
function StepperButton({ direction, onPress }: { direction: "prev" | "next"; onPress: () => void }) {
  return (
    <Pressable
      style={styles.stepperCircle}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={direction === "prev" ? "Previous day" : "Next day"}
    >
      <Text style={styles.stepperChevron}>{direction === "prev" ? "‹" : "›"}</Text>
    </Pressable>
  );
}

/** Filled maroon pill stepper — the canvas's in-plate control on a dish row. Identical to the
 * hall-menu screen's RowStepper; kept as its own copy rather than a shared import per this screen's
 * "don't touch/import from the screen #117 is reworking" constraint. */
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

export default function GrabNGoScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const hall = DINING_HALLS.find((h) => h.slug === slug);
  const gngTid = hall ? GRAB_N_GO_TIDS[hall.slug] : undefined;

  const [date, setDate] = useState(() => new Date());
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<FoodPreferences>({ allergensToAvoid: [], requiredDietTags: [] });
  const [favoriteDishKeys, setFavoriteDishKeys] = useState<Set<string>>(new Set());
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);

  const [plate, setPlate] = useState<PlateEntry[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [labelItem, setLabelItem] = useState<MenuItem | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const [logged, setLogged] = useState<string | null>(null);
  const [bannerHeight, setBannerHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const guardedLogPlate = useGuardedLogPlate(storage);

  useEffect(() => {
    if (!gngTid) return;
    // `current` guards against a stale response winning a race: two quick date-stepper taps fire
    // two fetches, and network order isn't request order -- without this, an in-flight response
    // for a date the user already stepped away from can land after the current one and overwrite
    // it. Ported from #117's hall-menu screen (halls/[slug].tsx), same fetch-effect shape.
    let current = true;
    setItems(null);
    setError(null); // clear a previous date's fetch failure -- else it pins the error screen across every later date step
    fetchMenu(gngTid, date)
      .then((result) => {
        if (current) setItems(result);
      })
      .catch((e) => {
        if (current) setError(String(e));
      });
    return () => {
      current = false;
    };
  }, [gngTid, date]);

  useEffect(() => {
    // Header subtitle only — a failure here just leaves the subtitle blank, never blocks the menu.
    fetchDiningHours()
      .then(setHoursFeed)
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      getPreferences().then(setPrefs);
      favoritesStorage.getFavorites().then((favs) => {
        setFavoriteDishKeys(new Set(favs.filter((f) => f.type === "dish").map(favoriteKey)));
      });
    }, []),
  );

  // Device-pass finding (carried over from the hall-menu screen): the logged banner never dismissed
  // on its own, permanently covering the last menu row until the plate was repopulated. Auto-dismiss
  // a few seconds after it appears.
  useEffect(() => {
    if (!logged) return;
    const timer = setTimeout(() => setLogged(null), 4000);
    return () => clearTimeout(timer);
  }, [logged]);

  const sections = useMemo(() => {
    if (!items) return [];
    const filtered = items.filter((i) => menuItemMatchesPreferences(i, prefs));
    const byCategory = new Map<string, Map<string, MenuItem>>();
    for (const item of filtered) {
      const title = item.category.trim();
      let bucket = byCategory.get(title);
      if (!bucket) {
        bucket = new Map();
        byCategory.set(title, bucket);
      }
      // Keyed by plate identity (dishName + hallTid), not insertion order: the same dish can appear
      // under two different mealPeriod values sharing one trimmed category (the feed has no
      // meal-period grouping here), and rendering both would put two identical rows sharing one
      // plate stepper in the section. Dedupe to the one row the stepper actually controls (#130 item 3).
      // First occurrence wins on a duplicate key -- fine as long as the feed never publishes two
      // differing nutrition panels for the same dish+category (a live probe across 16 dates x 4
      // locations found zero such duplicates at all, differing or not; see #121's review).
      const key = plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid });
      if (!bucket.has(key)) bucket.set(key, item);
    }
    return Array.from(byCategory, ([title, bucket]) => ({ title, data: Array.from(bucket.values()) }));
  }, [items, prefs]);

  const totals = useMemo(() => computeDailyTotals("plate", toLogEntries(plate, "1970-01-01T00:00:00.000Z")), [plate]);

  // #284 nit 2: only reachable via a crafted deep link (no in-app path produces an unknown slug),
  // but a dead end with no way back is still a bug -- same back-chevron affordance every other
  // header-less route in this file already draws.
  if (!hall || !gngTid)
    return (
      <View style={styles.container}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.error}>Unknown dining hall</Text>
      </View>
    );

  // Grab 'N Go locations don't match the hall-detection check in @udine/shared's get_infov2 mapping
  // (it requires "Commons" in the title), so they land in DiningHoursFeed.retail instead --
  // findGrabNGoLocation (lib/grabStrip.ts) is the same lookup the Home strip already uses.
  const retailHours = hoursFeed ? findGrabNGoLocation(hoursFeed.retail, hall.name) : null;
  // get_infov2 (and so hoursFeed) only ever publishes TODAY's hours -- once the date stepper moves
  // off today, showing it would paint a confidently wrong "open now · until ..." over a menu that
  // isn't today's. Omit the subtitle rather than show today's hours mislabeled, same call #117's
  // sibling mealTabSubtitle (hallMenuTabs.ts) makes for the hall-menu screen's tab-row subtitle.
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const subtitle = retailHours && isToday ? retailHeaderSubtitle(retailOpenStatus(retailHours, now)) : "";

  async function toggleDishFavorite(dishName: string) {
    const favorite: Favorite = { type: "dish", dishName };
    const key = favoriteKey(favorite);
    if (favoriteDishKeys.has(key)) {
      await favoritesStorage.removeFavorite(favorite);
    } else {
      await favoritesStorage.addFavorite(favorite);
    }
    const favs = await favoritesStorage.getFavorites();
    setFavoriteDishKeys(new Set(favs.filter((f) => f.type === "dish").map(favoriteKey)));
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

  async function logPlate() {
    // #147: guarded by useGuardedLogPlate (shared with halls/[slug].tsx) -- drops a second tap that
    // lands before this one's sequential addEntry() writes finish, instead of re-running
    // toLogEntries (fresh ids) and duplicating every row. Also drops a tap landing on an
    // already-emptied plate (the "Logged 0 items" symptom). Local-date-prefixed loggedAt, not
    // `.toISOString()` (UTC) -- see nowLocalIso's own comment (issue #111: evening logs were filing
    // under tomorrow's UTC date and vanishing from Today). Same #111 bug family, found in this screen
    // by PR #132's review (#130 item 6).
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing(4.5) }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{hall.name} Grab &apos;N Go</Text>
        </View>
        <View style={styles.dateStepper}>
          <StepperButton direction="prev" onPress={() => setDate((d) => addDays(d, -1))} />
          <Text style={styles.dateLabel}>{formatStepperDate(date)}</Text>
          <StepperButton direction="next" onPress={() => setDate((d) => addDays(d, 1))} />
        </View>
      </View>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}

      {error ? (
        <Text style={styles.error}>Failed to load menu: {error}</Text>
      ) : !items ? (
        <ActivityIndicator style={styles.loading} color={colors.maroon600} />
      ) : sections.length === 0 ? (
        <EmptyState title="No Grab 'N Go menu" message={`No Grab 'N Go items published at ${hall.name} for this day.`} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.category}-${item.dishName}-${index}`}
          contentContainerStyle={{ paddingBottom: listBottomPadding(barHeight, plate.length > 0) + (logged ? bannerHeight : 0) }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader title={section.title} />
            </View>
          )}
          renderItem={({ item }) => {
            const plateEntry = plate.find((p) => p.key === plateKeyFor({ type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid }));
            const isFavorite = favoriteDishKeys.has(favoriteKey({ type: "dish", dishName: item.dishName }));
            return (
              <View style={[styles.row, plateEntry && styles.rowInPlate]}>
                <Pressable onPress={() => toggleDishFavorite(item.dishName)} hitSlop={8}>
                  <Text style={[styles.star, isFavorite && styles.starActive]}>{isFavorite ? "★" : "☆"}</Text>
                </Pressable>
                <View style={styles.rowMain}>
                  <Text style={styles.rowText}>{item.dishName}</Text>
                  <Text style={styles.rowCalories}>
                    {item.nutrition.calories} cal · {Math.round(item.nutrition.proteinG)}g protein
                  </Text>
                </View>
                <Pressable
                  style={styles.infoButton}
                  onPress={() => setLabelItem(item)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Nutrition facts for ${item.dishName}`}
                >
                  <Text style={styles.infoIcon}>ⓘ</Text>
                </Pressable>
                {plateEntry ? (
                  <RowStepper count={plateEntry.count} dishName={item.dishName} onStep={(delta) => stepPlateItem(item, delta)} />
                ) : (
                  <Pressable style={styles.addButton} onPress={() => addToPlate(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add ${item.dishName} to plate`}>
                    <Text style={styles.addButtonText}>+</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
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
          style={[styles.loggedBanner, { position: "absolute", left: 0, right: 0, bottom: listBottomPadding(barHeight, plate.length > 0), paddingBottom: spacing(2) + insets.bottom }]}
          onLayout={(e) => setBannerHeight(e.nativeEvent.layout.height)}
        >
          <Text style={styles.loggedBannerText}>{logged}</Text>
        </View>
      )}
      {plate.length > 0 && (
        <PlateBar itemCount={totalItemCount(plate)} totals={totals} onPress={() => setSheetOpen(true)} onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)} />
      )}
      <PlateSheet
        visible={sheetOpen}
        plate={plate}
        totals={totals}
        contextLabel={`${hall.name} Grab 'N Go`}
        onStep={(key, delta) => setPlate((p) => stepCount(p, key, delta))}
        onAddOffResult={addOffResult}
        onLog={logPlate}
        onClose={() => setSheetOpen(false)}
      />
      {labelItem && (
        <NutritionLabel
          visible={!!labelItem}
          dishName={labelItem.dishName}
          subtitle={`${hall.name} Grab 'N Go · ${labelItem.category.trim()}`}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream100 },
  loading: { flex: 1, backgroundColor: colors.cream100 },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body400 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(1.5),
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), flexShrink: 1 },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  headerTitle: {
    fontFamily: fonts.display700,
    fontSize: fs(22),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
    flexShrink: 1,
  },
  headerSubtitle: {
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(1.5),
    fontFamily: fonts.body400,
    fontSize: fs(12),
    color: withOpacity(colors.ink900, 60),
  },

  dateStepper: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  stepperCircle: {
    width: fs(30),
    height: fs(30),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon900, 25),
    alignItems: "center",
    justifyContent: "center",
  },
  stepperChevron: { fontFamily: fonts.body400, fontSize: fs(16), color: colors.maroon900 },
  dateLabel: {
    fontFamily: fonts.body600,
    fontSize: fs(11),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: withOpacity(colors.ink900, 60),
  },

  sectionHeaderWrap: {
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
    paddingBottom: spacing(2),
    backgroundColor: colors.cream100,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
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
  rowMain: { flex: 1, gap: 1 },
  rowText: { fontSize: fs(14), fontFamily: fonts.body600, color: colors.ink900 },
  rowCalories: { fontSize: fs(12), fontFamily: fonts.mono, color: withOpacity(colors.ink900, 60) },
  star: { fontSize: fs(20), color: withOpacity(colors.ink900, 30) },
  starActive: { color: colors.gold500 },
  infoButton: { width: fs(30), height: fs(44), alignItems: "center", justifyContent: "center" },
  infoIcon: { fontSize: fs(18), color: withOpacity(colors.ink900, 40) },

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
