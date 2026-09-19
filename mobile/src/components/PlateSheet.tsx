import { searchBrandedFoods, searchFoods, searchProducts, type CustomFoodsStorage, type DailyMacroTotals, type DishCatalogEntry, type LogStorage } from "@udine/shared";
import { useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { FadeIn, useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { Spinner } from "./Skeleton";
import { searchCustomFoods } from "../lib/customFoodsStorage";
import { getCachedDishCatalog, refreshDishCatalogIfStale, searchCachedDishes } from "../lib/dishCatalog";
import { getLoggedUmassDishHistory, type HistoryDish } from "../lib/dishHistory";
import { labelLookupCandidate, lookupDishLive, type LookupDishCandidate, type LookupDishResult } from "../lib/lookupDish";
import { durations } from "../lib/motion";
import { isEstimatedServing, plateSearchResultDetail, plateSearchResultKey, totalItemCount, type PlateEntry, type PlateSearchResult } from "../lib/plate";
import { formatServings, parseServingsInput } from "../lib/servingsStepper";
import { supabase } from "../lib/supabase";
import { Button, Stat } from "./ui";
import { useDraggableSheet } from "../lib/sheetAnimation";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

/** Per-kind badge label/fill/text -- PlateSearchResult (lib/plate.ts) is the merged-search tagged
 * union this reads off of. Filled pills per PlateSheetResults.dc.html:49,60,71,82,93. */
const BADGE_INFO: Record<PlateSearchResult["kind"], { label: string; fill: string; color: string }> = {
  umass: { label: "UMass", fill: "rgba(59,10,15,0.08)", color: "#3b0a0f" },
  custom: { label: "Custom", fill: "rgba(201,154,46,0.16)", color: "#8a6a1a" },
  off: { label: "Packaged", fill: "rgba(36,26,20,0.08)", color: "rgba(36,26,20,0.65)" },
  usda: { label: "USDA", fill: "rgba(92,112,72,0.16)", color: "#4a5c3a" },
};

// How many merged results are visible at once (owner: "maybe 5 ... until scrolling for more").
// Caps the DISPLAY of the merged list independent of how many of the 6 search sources returned
// hits -- loadMore() reveals more of what's already fetched in increments of this size before it
// ever spends a network round-trip fetching another page from an exhausted source.
const VISIBLE_RESULTS = 5;

// Dev-only stress fixture for runDirectLookup's "hit" branch (.claude/agents/pr-reviewer.md's UI check
// + mobile/scripts/screenshot.sh's --stress flag), mirroring halls/[slug].tsx's
// stressFixtureItems/`?stress=` pattern. lookup-dish isn't deployed yet, so a real multi-candidate
// hit can't be triggered over the network for a screenshot -- this fakes lookupDishLive's return
// shape instead. Two candidates share a dishName (forces labelLookupCandidate's "(location)"
// suffix onto both), and one of those pairs a long dish name with a long location name -- the
// wrap/overflow case a reviewer would actually worry about, not a conveniently short one.
const STRESS_LOOKUP_QUERY = "flatbread";
// Which stress fixture names drive runDirectLookup below -- "lookup-fetching" deliberately never
// resolves so screenshot.sh's --record has a stable window to capture the inline spinner row
// (brief foodpro-menu-expansion task 4); "lookup-miss"/"lookup-rate-limited" fake the two other
// server states lookup-dish can return, which otherwise can't be forced on demand from a device.
const LOOKUP_STRESS_FIXTURES = new Set(["lookup-hit", "lookup-fetching", "lookup-miss", "lookup-rate-limited"]);
const STRESS_LOOKUP_CANDIDATES: LookupDishCandidate[] = [
  {
    dishName: "Wood-Fired Margherita Flatbread with Burrata, Basil & Calabrian Chili Honey",
    location: "Bluewall Tavola at the Isenberg School of Management Concourse",
    hallTid: 2,
    nutrition: {
      servingSize: "1 flatbread",
      calories: 640,
      caloriesFromFat: 220,
      totalFatG: 24,
      satFatG: 11,
      transFatG: 0,
      cholesterolMg: 45,
      sodiumMg: 980,
      totalCarbG: 72,
      dietaryFiberG: 4,
      sugarsG: 6,
      proteinG: 26,
    },
    allergens: ["Milk", "Wheat"],
    dietTags: ["Vegetarian"],
  },
  {
    dishName: "Wood-Fired Margherita Flatbread with Burrata, Basil & Calabrian Chili Honey",
    location: "Blue Wall Café",
    hallTid: 1,
    nutrition: {
      servingSize: "1 flatbread",
      calories: 610,
      caloriesFromFat: 200,
      totalFatG: 22,
      satFatG: 10,
      transFatG: 0,
      cholesterolMg: 40,
      sodiumMg: 910,
      totalCarbG: 70,
      dietaryFiberG: 4,
      sugarsG: 5,
      proteinG: 24,
    },
    allergens: ["Milk", "Wheat"],
    dietTags: ["Vegetarian"],
  },
  {
    dishName: "Grilled Chicken Caesar Wrap",
    location: "Worcester Dining Commons",
    hallTid: 1,
    nutrition: {
      servingSize: "1 wrap",
      calories: 480,
      caloriesFromFat: 180,
      totalFatG: 20,
      satFatG: 5,
      transFatG: 0,
      cholesterolMg: 65,
      sodiumMg: 1020,
      totalCarbG: 42,
      dietaryFiberG: 3,
      sugarsG: 3,
      proteinG: 30,
    },
    allergens: ["Milk", "Wheat", "Egg"],
    dietTags: [],
  },
];

// Dev-only stress fixture for decision 5's live catalog-refresh splice
// (docs/briefs/plate-search-semantics.md) -- there's no way to force a real Supabase catalog sync
// to resolve mid-search on demand for screenshot.sh, so this fakes refreshDishCatalogIfStale's
// timing/result the same way STRESS_LOOKUP_CANDIDATES above fakes lookupDishLive: a real (short)
// delay long enough for --record to capture the "before" state, resolving with one new umass hit
// for the query already searched.
const STRESS_CATALOG_REFRESH_FIXTURE = "catalog-refresh";
const STRESS_CATALOG_REFRESH_QUERY = "ramen";
// Fixed delay AFTER the real merged search settles (not from mount) -- a flat mount-relative
// timer raced ahead of a real device's actual search latency (a synced local catalog can itself
// take a moment to scan, and OFF/USDA are real network calls), landing while results was still
// null and silently no-op'ing the splice. See the poll loop below this fixture drives.
const STRESS_CATALOG_REFRESH_DELAY_MS = 200;
const STRESS_CATALOG_REFRESH_POLL_MS = 150;
const STRESS_CATALOG_REFRESH_POLL_MAX_ATTEMPTS = 100; // ~15s ceiling -- never hangs forever if the auto-search somehow never settles
const STRESS_CATALOG_REFRESH_DISH: DishCatalogEntry = {
  dishName: "Miso Ramen Bowl",
  nutrition: {
    servingSize: "1 bowl",
    calories: 480,
    caloriesFromFat: 90,
    totalFatG: 10,
    satFatG: 2,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 1400,
    totalCarbG: 68,
    dietaryFiberG: 4,
    sugarsG: 6,
    proteinG: 22,
  },
  allergens: ["Soy", "Wheat"],
  dietTags: ["Vegetarian"],
  updatedAt: new Date(0).toISOString(),
};

/** Whether a result belongs to the umass/custom "local" group decision 1
 * (docs/briefs/plate-search-semantics.md) always sorts first, regardless of which of the 4 search
 * groups' promises settled first -- "UMass numbers are source of truth on campus" (CLAUDE.md). */
function isLocalGroup(result: PlateSearchResult): boolean {
  return result.kind === "umass" || result.kind === "custom";
}

/** Match-quality tier for decision 2's within-local-group interleaving -- lower sorts first.
 * There's no unified cross-source relevance score today (OFF/USDA rank server-side; umass
 * catalog/history/custom are unscored substring matches), so this is the operational stand-in the
 * brief specifies: an exact or prefix match on the displayed name outranks a plain substring
 * match. */
function matchQualityTier(name: string, query: string): 0 | 1 | 2 {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  return 2;
}

/** Re-sorts the full merged list after every splice (the 4 search groups, loadMore, a manual
 * direct lookup, or a live catalog-refresh splice) -- local (umass+custom) results first, ordered
 * by matchQualityTier against the query that produced them; OFF/USDA keep their own
 * already-ranked relative order and sort after, per decisions 1-2. The explicit index tiebreak
 * (rather than relying on the host JS engine's sort being stable) keeps a group's own arrival
 * order intact. */
function sortSearchResults(results: PlateSearchResult[], query: string): PlateSearchResult[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const localA = isLocalGroup(a.result);
      const localB = isLocalGroup(b.result);
      if (localA !== localB) return localA ? -1 : 1;
      if (localA) {
        const delta = matchQualityTier(plateSearchResultDetail(a.result).dishName, query) - matchQualityTier(plateSearchResultDetail(b.result).dishName, query);
        if (delta !== 0) return delta;
      }
      return a.index - b.index;
    })
    .map(({ result }) => result);
}

interface Props {
  visible: boolean;
  plate: PlateEntry[];
  totals: DailyMacroTotals;
  /** Right-of-title context (e.g. "Hampshire · Lunch") — the caller (halls/[slug].tsx) joins its
   * hall name with the currently-selected meal/Grab tab via hallMenuTabs.ts's
   * plateSheetContextLabel, per PlateSheetResults.dc.html:32. */
  contextLabel?: string;
  /** Backs the local-history half of the merged search. Caller passes its own LogStorage instance
   * through rather than this sheet owning a duplicate. */
  logStorage: LogStorage;
  /** Backs the custom-food half of the merged search, same pass-through convention as logStorage. */
  customFoodsStorage: CustomFoodsStorage;
  /** The hall (or café) currently being browsed -- history search is scoped to this hallTid only,
   * never cross-hall (a re-added dish's hallTid feeds server-synced hall-completion/favorite-hall
   * derivation, so cross-hall dedup could misattribute credit between two halls sharing a dish
   * name). A catalog-only hit is scoped to this same hallTid when staged. */
  hallTid: number;
  onStep: (key: string, delta: number) => void;
  /** Manual entry (tap the count, type an exact amount -- halves and any other decimal, not
   * just ±1 steps). Wired straight to plate.ts's setCount. */
  onSetCount: (key: string, count: number) => void;
  /** Tapping any search result opens the shared NutritionLabel confirm/detail step -- lifted to the
   * caller rather than nested inside this sheet's own Modal (no Modal-in-Modal precedent in this
   * codebase). The caller renders NutritionLabel as a sibling; its onAddToPlate actually adds the
   * result to the plate. */
  onShowResultDetail: (result: PlateSearchResult) => void;
  /** The standing "Can't find it? Create a custom food" footer row -- also lifted to the caller for
   * the same nested-Modal reason. Prefilled with whatever's currently typed in the search box. */
  onOpenCustomFoodForm: (prefillName: string | undefined) => void;
  onLog: () => void;
  onClose: () => void;
  /** A standing-menu row with no catalog match opens this sheet pre-seeded with its parsed name --
   * filled into the search box AND searched immediately. Undefined for every other opener (the
   * plain PlateBar tap), which starts on a blank box. The caller clears this the moment `onClose`
   * fires, so reopening via the plain PlateBar tap afterward doesn't reseed. */
  initialQuery?: string;
  /** dev-only: selects a runDirectLookup stress fixture, see STRESS_LOOKUP_CANDIDATES above. */
  stressFixture?: string;
}

/**
 * Expanded plate sheet -- a bottom sheet over a dimmed scrim: drag handle, per-item steppers,
 * totals grid, LOG N ITEMS, and a single merged search box (local device history + the cached dish
 * catalog + OpenFoodFacts + USDA FoodData Central + saved custom foods, tagged per-row). An
 * absolutely-positioned overlay inside the caller's screen (no route, no _layout.tsx change, no
 * MenuItem serialization through router params) -- deliberately NOT an RN Modal: see the
 * keyboard-follow note below for why the search box has to live in the screen's own window.
 */
export function PlateSheet({
  visible,
  plate,
  totals,
  contextLabel,
  logStorage,
  customFoodsStorage,
  hallTid,
  onStep,
  onSetCount,
  onShowResultDetail,
  onOpenCustomFoodForm,
  onLog,
  onClose,
  initialQuery,
  stressFixture,
}: Props) {
  const [query, setQuery] = useState("");
  // Tap-to-type serving entry: which row's count is currently an editable TextInput (null = none
  // are). Only one row edits at a time -- starting a new one commits whatever was already typed
  // into the row being left, rather than relying on TextInput's onBlur firing before it unmounts
  // (RN doesn't guarantee that ordering when the conditional swaps the child out from under it).
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  // "Add something else" starts idle (dashed row, no live input) until tapped. Auto-expanded by
  // the initialQuery effect below since that path seeds and runs a search immediately.
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [results, setResults] = useState<PlateSearchResult[] | null>(null);
  // How much of `results` is actually rendered -- reset to VISIBLE_RESULTS on every fresh search
  // and advanced by loadMore, independent of offPage/usdaPage/brandedPage below (those track each
  // network source's own next-page cursor; this tracks the display slice of the merged list).
  const [visibleCount, setVisibleCount] = useState(VISIBLE_RESULTS);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Pagination cursors for the networked sources (OFF/USDA/Branded) -- umass history/catalog and
  // custom foods are local device queries with no meaningful "next page" of their own. Reset on
  // every fresh search (runSearch) and advanced by loadMore below.
  const [offPage, setOffPage] = useState(1);
  const [offHasMore, setOffHasMore] = useState(false);
  const [usdaPage, setUsdaPage] = useState(1);
  const [usdaHasMore, setUsdaHasMore] = useState(false);
  // Branded (USDA FDC, dataType=Branded) is a second, independent parallel call alongside the
  // Foundation/SR Legacy one above -- same "usda" PlateSearchResult kind/badge, its own pagination
  // cursor since it's its own paged endpoint call.
  const [brandedPage, setBrandedPage] = useState(1);
  const [brandedHasMore, setBrandedHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // "Search UMass Dining directly" -- the manual (never automatic) fallback to lookup-dish's
  // on-demand FoodPro Web INA lookup, unconditionally available once a merged search finishes
  // (decision 3, plate-search-semantics.md) regardless of what `results` contains.
  const [directLookup, setDirectLookup] = useState<"idle" | "loading" | "miss" | "rate_limited">("idle");
  // Result keys a live catalog-refresh splice (decision 5) just added mid-search -- rendered with
  // the same FadeIn entrance halls/[slug].tsx's own expanded-content reveal uses, so a newly
  // -available row is visibly distinguished as just-arrived without any new explanatory text.
  // Never removed from this set once added (entering only plays once, on mount, so a stale
  // membership after that is harmless) -- reset on every fresh search / on close instead.
  const [justArrivedKeys, setJustArrivedKeys] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();
  const { gesture, backdropStyle, panelStyle, modalVisible } = useDraggableSheet(visible, onClose, fs(640));
  const scrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);
  // The declarative `autoFocus` prop doesn't reliably request focus for a TextInput that's newly
  // mounted by a re-render inside an already-open Modal (confirmed on-device: the native EditText
  // never gained input focus and no keyboard appeared, though a manual tap on the same field
  // focused it instantly) -- Android needs the view to actually finish attaching/laying out first.
  // Deferring the imperative .focus() call to the next frame gives it that time.
  useEffect(() => {
    if (searchExpanded) {
      const id = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [searchExpanded]);
  // Keyboard-follow via Reanimated's useAnimatedKeyboard: a per-frame SharedValue in lockstep with
  // the keyboard's own slide (a Keyboard-event-fed useState snaps to the final value a frame ahead
  // of the still-animating keyboard). Read with `.value`, not `.get()` -- the reanimated jest
  // mock's default `height` is a bare number with no `.get()`.
  //
  // This only works because the sheet is NOT hosted in an RN <Modal>. On Android a Modal is its own
  // Dialog window, and the OS delivers the IME insets animation only to the window owning the
  // focused input -- while useAnimatedKeyboard's native side listens on the Activity window's
  // decorView (react-native-reanimated/android/.../keyboard/WindowsInsetsManager.kt). With the
  // search box inside a Modal, the hook's height/state stayed 0/UNKNOWN on a real device (Galaxy
  // A53, Android 16) and the whole search pane rendered behind the keyboard; the API-35 emulator
  // happened not to show it (#507). Rendering the sheet as an in-screen overlay keeps the input in
  // the window the hook observes -- that's the fix, not a second keyboard-height source.
  const keyboard = useAnimatedKeyboard();
  const keyboardStyle = useAnimatedStyle(() => ({ marginBottom: keyboard.height.value }));
  // Modal's onRequestClose used to map Android's hardware back to onClose; wired explicitly now.
  // Keyed on modalVisible (not `visible`) so the listener lives exactly as long as the overlay
  // renders -- through the ~300ms close animation too, where the old Dialog would still have
  // absorbed a back press instead of letting it pop the screen underneath.
  useEffect(() => {
    if (!modalVisible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [modalVisible, onClose]);
  // Bumped on every new search and on close -- a resolving search only applies its result if this
  // still matches the seq it captured when it started, so a slower/stale response can never
  // overwrite a newer query's results (or repaint a sheet the user closed).
  const searchSeq = useRef(0);
  // The query a currently-running runSearch() actually started with -- lets runSearch tell "mash
  // Enter again with the SAME query" (still a no-op) apart from "submit a genuinely different
  // query while one's in flight" (decision 6: allowed, and supersedes via searchSeq like every
  // other source already does).
  const inFlightQueryRef = useRef<string | null>(null);
  // The query the most recent runSearch() actually committed to -- set synchronously in runSearch
  // itself (below), NOT mirrored from the live TextInput-bound `query` state. Decision 5's
  // catalog-refresh effect needs the query the currently-DISPLAYED `results` were produced for:
  // reading live `query` state instead was a real bug (pr-reviewer, PR #516) -- type "ramen",
  // search, then start typing "pizza" without submitting; searchSeq never moves (no new search
  // actually started), so the staleness guard alone doesn't catch it, and the refresh would
  // re-match the still-displayed "ramen" results against "pizza" instead.
  const committedQueryRef = useRef("");
  // Mirrors `results` for the catalog-refresh effect below, which resolves long after this
  // render -- a closure captured once at mount (deps []) would otherwise see the initial null
  // results forever. Same "stale closure" fix as halls/[slug].tsx's scrubberLatestRef.
  const latestResultsRef = useRef(results);
  useEffect(() => {
    latestResultsRef.current = results;
  }, [results]);
  // PlateSheet stays mounted across open/close (only the Modal's `visible` prop toggles) --
  // mount-once is the right place to fire off a background catalog refresh. Fire-and-forget:
  // refreshDishCatalogIfStale already swallows its own errors, and this screen must never block on
  // (or fail because of) a background sync.
  //
  // Decision 5 (plate-search-semantics.md): a refresh that resolves while a search is already open
  // must actually feed it, not just sync silently in the background for the NEXT search. Once it
  // resolves, re-read the (possibly now-updated) local catalog and re-run the same local-only
  // search the umass/history/custom group already does, splicing in whatever's new -- gated by the
  // same searchSeq a stale group response or a closed sheet already invalidates.
  // Shared by the real refresh below and the dev-only fixture further down -- both just need to
  // supply "the query it resolved for" and "the umass hits that query now has", gated by the same
  // searchSeq check either path already made before calling this.
  function applyLiveCatalogHits(q: string, hits: DishCatalogEntry[]) {
    const existingUmassNames = new Set<string>();
    for (const r of latestResultsRef.current ?? []) {
      if (r.kind === "umass") existingUmassNames.add(r.dish.dishName.toLowerCase());
    }
    const additions: PlateSearchResult[] = hits
      .filter((entry) => !existingUmassNames.has(entry.dishName.toLowerCase()))
      .map((entry) => ({ kind: "umass", dish: { dishName: entry.dishName, hallTid, nutrition: entry.nutrition } }));
    if (additions.length === 0) return; // nothing the committed query didn't already have
    setJustArrivedKeys((prev) => new Set([...prev, ...additions.map((r) => plateSearchResultKey(r))]));
    setResults((prev) => sortSearchResults([...(prev ?? []), ...additions], q));
    // Reveal the new row(s) immediately rather than leaving them hidden behind Load More --
    // buried behind an extra tap defeats the point of a visible live update.
    setVisibleCount((v) => v + additions.length);
  }

  useEffect(() => {
    refreshDishCatalogIfStale(supabase)
      .then(async () => {
        const q = committedQueryRef.current;
        const activeResults = latestResultsRef.current;
        if (!q || activeResults === null) return; // no open search for this refresh to feed
        const seq = searchSeq.current;
        const hits = searchCachedDishes(await getCachedDishCatalog(), q);
        // Re-check AFTER the async re-read, against the LATEST results -- a new search or a close
        // that happened while this was running must not repaint over it.
        if (searchSeq.current !== seq) return;
        applyLiveCatalogHits(q, hits);
      })
      .catch((e) => {
        // getCachedDishCatalog/searchCachedDishes/setState calls above are new, reachable-from-a-
        // promise-chain code that didn't exist before decision 5 -- refreshDishCatalogIfStale
        // itself already swallows its own errors, but nothing downstream of it did, so this must
        // never become an unhandled rejection the same way the original fire-and-forget call
        // (which had no .then() at all) could never throw one either.
        console.warn("live catalog-refresh splice failed", e);
      });
    // Deliberately mount-once (see comment above), not [hallTid] -- this PlateSheet instance's
    // hallTid prop doesn't change without a remount in practice (own route per hall), same
    // reasoning candidatesToResults/runSearch already rely on for the same prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // __DEV__-only fixture for decision 5's screenshot (see STRESS_CATALOG_REFRESH_FIXTURE's own
  // comment above) -- deliberately its OWN effect, keyed on [stressFixture] and guarded by a ref
  // rather than folded into the mount-once real-refresh effect above. A `[]`-dep effect only ever
  // sees the `stressFixture` prop's value from PlateSheet's OWN first mount, which can race behind
  // the deep link that actually attaches the `?stress=` param -- confirmed live capturing this
  // fixture's own screenshot: the emulator's cold-launch can land on this exact route (e.g. a
  // persisted last-viewed hall) a beat before the stress query param arrives, permanently locking
  // a `[]`-dep effect onto "not the fixture" and silently falling through to the real (here,
  // no-op in dev with no stale local catalog) path instead. Depending on `[stressFixture]` lets
  // this retry once the prop actually updates; the ref stops it from restarting the poll/delay a
  // second time if the prop happens to update again afterward.
  const catalogRefreshFixtureStartedRef = useRef(false);
  useEffect(() => {
    if (!__DEV__ || stressFixture !== STRESS_CATALOG_REFRESH_FIXTURE || catalogRefreshFixtureStartedRef.current) return;
    catalogRefreshFixtureStartedRef.current = true;
    (async () => {
      // Wait for the auto-driven search (below) to actually settle (results non-null) before
      // pretending the catalog refresh resolves -- a flat mount-relative timer alone raced ahead
      // of a real device's actual search latency (a synced local catalog can itself take a moment
      // to scan, and OFF/USDA are real network calls), landing while results was still null and
      // silently no-op'ing the splice.
      for (let attempt = 0; latestResultsRef.current === null && attempt < STRESS_CATALOG_REFRESH_POLL_MAX_ATTEMPTS; attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, STRESS_CATALOG_REFRESH_POLL_MS));
      }
      await new Promise<void>((resolve) => setTimeout(resolve, STRESS_CATALOG_REFRESH_DELAY_MS));
      const q = committedQueryRef.current;
      if (!q || latestResultsRef.current === null) return;
      const seq = searchSeq.current;
      const hits = q === STRESS_CATALOG_REFRESH_QUERY ? [STRESS_CATALOG_REFRESH_DISH] : [];
      if (searchSeq.current !== seq) return;
      applyLiveCatalogHits(q, hits);
    })().catch((e) => console.warn("catalog-refresh fixture failed", e));
    // applyLiveCatalogHits is a fresh closure every render (same as runSearch/runDirectLookup
    // elsewhere in this file); adding it here would re-fire this effect every render instead of
    // only when stressFixture changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stressFixture]);

  const itemCount = totalItemCount(plate);

  // Closing invalidates whatever's in flight and resets the search box -- a stale response that
  // resolves after close must not repaint a sheet the user dismissed, and reopening should offer a
  // clean search rather than a "searching..." spinner stuck on a request nothing will ever apply.
  useEffect(() => {
    if (!visible) {
      searchSeq.current++;
      setSearching(false);
      setVisibleCount(VISIBLE_RESULTS);
      setSearchError(null);
      setQuery("");
      setEditingKey(null);
      setSearchExpanded(false);
      setOffPage(1);
      setOffHasMore(false);
      setUsdaPage(1);
      setUsdaHasMore(false);
      setBrandedPage(1);
      setBrandedHasMore(false);
      setLoadingMore(false);
      setDirectLookup("idle");
      setJustArrivedKeys(new Set());
      inFlightQueryRef.current = null;
      committedQueryRef.current = "";
    }
  }, [visible]);

  function beginEditingCount(entry: PlateEntry) {
    if (editingKey && editingKey !== entry.key) commitEditingCount();
    setEditingKey(entry.key);
    setEditingText(formatServings(entry.count));
  }

  // Invalid/empty input (parseServingsInput returns null) leaves the count untouched rather than
  // falling back to Number("")'s 0, which setCount would treat as "remove this row".
  function commitEditingCount() {
    if (editingKey) {
      const parsed = parseServingsInput(editingText);
      if (parsed !== null) onSetCount(editingKey, parsed);
    }
    setEditingKey(null);
  }

  // Seeds the search box (and runs the search) the instant a caller opens this sheet with a
  // pre-filled query. Keyed on [visible, initialQuery], not just initialQuery, so re-showing the
  // same seed after a close fires again instead of React bailing out on an unchanged prop.
  // runSearch(initialQuery), not a bare runSearch() after setQuery -- setQuery is async/batched, so
  // a same-tick runSearch() would still close over the previous render's query. runSearch itself is
  // deliberately not a dependency -- it's a fresh identity every render, which would refire this on
  // every keystroke.
  useEffect(() => {
    if (visible && initialQuery) {
      setQuery(initialQuery);
      setSearchExpanded(true);
      runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialQuery]);

  // Restructured (3b) into 4 independent groups -- local (history+catalog+custom, all local/instant
  // reads), OFF, USDA, Branded -- each splicing straight into `results` as it resolves, instead of
  // one Promise.allSettled gating every row on the slowest of all 6 sources. Mirrors the splice
  // pattern runDirectLookup/loadMore below already use (`setResults((prev) => [...(prev ?? []), ...])`),
  // gated by the same searchSeq ref they check.
  function runSearch(queryOverride?: string) {
    const raw = queryOverride ?? query;
    if (!raw.trim()) return;
    const q = raw.trim();
    // Resubmitting the SAME still-in-flight query is a no-op -- mashing Enter/tapping Search again
    // while typing would otherwise fire overlapping requests for it. A genuinely DIFFERENT query
    // while one's running is allowed through instead of blocked (decision 6,
    // plate-search-semantics.md): it bumps searchSeq below, which already makes the old search's
    // late splices/groupSettled no-ops the same way it already does for a closed sheet or a stale
    // runDirectLookup response.
    if (searching && q === inFlightQueryRef.current) return;
    inFlightQueryRef.current = q;
    // The query `results` is now committed to -- decision 5's catalog-refresh effect reads this,
    // not live `query` state (see its own comment): the box can keep changing after this point
    // without it meaning anything until/unless another runSearch() call updates it.
    committedQueryRef.current = q;
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(null);
    setDirectLookup("idle"); // a fresh search re-earns the "Search UMass Dining directly" affordance
    setJustArrivedKeys(new Set()); // a fresh search's own rows are never "just arrived" -- only a live catalog splice into an OPEN search is
    // Reset the paging/display state a fresh search owns up front, not at the end -- each group
    // below sets its own hasMore as it resolves, so these can't wait for the slowest one either.
    // `results` is explicitly reset to `null` (not left as whatever a PRIOR search left it at --
    // #494 review caught a regression here: a second search in the same open sheet was appending
    // its splices onto the first search's still-there results instead of replacing them) and NOT
    // eagerly set to `[]` -- until either a group's splice actually adds rows or the finalize step
    // below decides there's genuinely nothing, so "No matches" never flashes mid-stream.
    setResults(null);
    setVisibleCount(VISIBLE_RESULTS);
    setOffPage(1);
    setOffHasMore(false);
    setUsdaPage(1);
    setUsdaHasMore(false);
    setBrandedPage(1);
    setBrandedHasMore(false);

    // Tracked locally (not as React state) across this one runSearch call -- reading `results`
    // state back inside these closures would see a stale snapshot from whenever each closure was
    // created, not the latest spliced-in value.
    let addedAnything = false;
    let anyRejected = false;
    let settledGroups = 0;
    const GROUP_COUNT = 4;

    function splice(additions: PlateSearchResult[]) {
      if (searchSeq.current !== seq || additions.length === 0) return;
      addedAnything = true;
      setResults((prev) => sortSearchResults([...(prev ?? []), ...additions], q));
    }

    // Runs once all 4 groups have settled -- not per-group -- so `searching`/the "Search UMass
    // Dining directly" affordance/the custom-food footer don't flash mid-stream.
    function groupSettled() {
      settledGroups++;
      if (settledGroups < GROUP_COUNT || searchSeq.current !== seq) return;
      setSearching(false);
      if (addedAnything) return; // some group already spliced real rows in -- nothing left to decide
      if (anyRejected) {
        // Generic, honest copy -- never the raw rejection, which leaks implementation details.
        // `results` stays null (not []) since [] would also trigger the "No matches" hint below,
        // which reads as confusing alongside an error. The footer's gating condition covers this
        // branch too, so the "Create a custom food" escape hatch stays available here.
        setSearchError("please try again, or create a custom food below");
      } else {
        setResults([]); // every group legitimately resolved empty -- the real "No matches" state
      }
    }

    // Local group: device-log history + cached dish catalog + saved custom foods. Deduped by
    // dishName together (history wins on collision) since they're both near-instant local reads --
    // splitting them would let a catalog hit and a history hit for the same dish land as separate
    // rows before dedup runs. Custom foods (also local/instant) rides along rather than getting a
    // fifth split, since there's nothing networked to stream separately.
    (async () => {
      try {
        const [historySettled, catalogSettled, customSettled] = await Promise.allSettled([
          getLoggedUmassDishHistory(logStorage, hallTid, q),
          getCachedDishCatalog().then((catalog) => searchCachedDishes(catalog, q)),
          customFoodsStorage.getAllCustomFoods().then((foods) => searchCustomFoods(foods, q)),
        ]);
        if (searchSeq.current !== seq) return;
        if ([historySettled, catalogSettled, customSettled].some((r) => r.status === "rejected")) anyRejected = true;

        const history = historySettled.status === "fulfilled" ? historySettled.value : [];
        const catalogHits = catalogSettled.status === "fulfilled" ? catalogSettled.value : [];
        const custom = customSettled.status === "fulfilled" ? customSettled.value : [];

        // Merge the two UMass-side sources by dishName (case-insensitive). Local history wins on a
        // name collision -- it's already confirmed-logged at this exact hall, no network
        // dependency. A catalog-only hit is staged as a HistoryDish scoped to the
        // CURRENTLY-BROWSED hall so it flows through the existing historyDishToPlateEntry path
        // unchanged.
        const umassByName = new Map<string, HistoryDish>();
        for (const entry of catalogHits) {
          umassByName.set(entry.dishName.toLowerCase(), { dishName: entry.dishName, hallTid, nutrition: entry.nutrition });
        }
        for (const dish of history) {
          umassByName.set(dish.dishName.toLowerCase(), dish); // history wins on collision
        }

        splice([
          ...[...umassByName.values()].map((dish): PlateSearchResult => ({ kind: "umass", dish })),
          ...custom.map((food): PlateSearchResult => ({ kind: "custom", food })),
        ]);
      } catch {
        anyRejected = true;
      } finally {
        groupSettled();
      }
    })();

    // OFF group.
    (async () => {
      try {
        const off = await searchProducts(q);
        if (searchSeq.current !== seq) return;
        splice(off.results.map((product): PlateSearchResult => ({ kind: "off", product })));
        setOffHasMore(off.hasMore);
      } catch {
        anyRejected = true;
      } finally {
        groupSettled();
      }
    })();

    // USDA group (Foundation/SR Legacy).
    (async () => {
      try {
        const usda = await searchFoods(q);
        if (searchSeq.current !== seq) return;
        splice(usda.results.map((food): PlateSearchResult => ({ kind: "usda", food })));
        setUsdaHasMore(usda.hasMore);
      } catch {
        anyRejected = true;
      } finally {
        groupSettled();
      }
    })();

    // Branded (USDA FDC) group -- a second, independent paged endpoint call, same "usda" kind/badge.
    (async () => {
      try {
        const branded = await searchBrandedFoods(q);
        if (searchSeq.current !== seq) return;
        splice(branded.results.map((food): PlateSearchResult => ({ kind: "usda", food })));
        setBrandedHasMore(branded.hasMore);
      } catch {
        anyRejected = true;
      } finally {
        groupSettled();
      }
    })();
  }

  /** "Load More" reveals more of the already-fetched `results` buffer first (no network cost) --
   * only once the visible slice has caught up to the full merged buffer does it fetch the next
   * page of whichever of OFF/USDA/Branded still has more. umass history/catalog and custom foods
   * are local, unpaginated queries with no "next page" of their own. */
  async function loadMore() {
    if (loadingMore) return;
    if (visibleCount < (results?.length ?? 0)) {
      setVisibleCount((v) => v + VISIBLE_RESULTS);
      return;
    }
    if (!offHasMore && !usdaHasMore && !brandedHasMore) return;
    const q = query.trim();
    if (!q) return;
    const seq = searchSeq.current; // gated the same way runSearch is -- a stale response must not append onto a newer/closed search
    setLoadingMore(true);
    try {
      const [offSettled, usdaSettled, brandedSettled] = await Promise.allSettled([
        offHasMore ? searchProducts(q, offPage + 1) : Promise.resolve(null),
        usdaHasMore ? searchFoods(q, usdaPage + 1) : Promise.resolve(null),
        brandedHasMore ? searchBrandedFoods(q, brandedPage + 1) : Promise.resolve(null),
      ]);
      if (searchSeq.current !== seq) return;

      const off = offSettled.status === "fulfilled" ? offSettled.value : null;
      const usda = usdaSettled.status === "fulfilled" ? usdaSettled.value : null;
      const branded = brandedSettled.status === "fulfilled" ? brandedSettled.value : null;

      const additions: PlateSearchResult[] = [
        ...(off?.results.map((product): PlateSearchResult => ({ kind: "off", product })) ?? []),
        ...(usda?.results.map((food): PlateSearchResult => ({ kind: "usda", food })) ?? []),
        ...(branded?.results.map((food): PlateSearchResult => ({ kind: "usda", food })) ?? []),
      ];
      if (additions.length > 0) setResults((prev) => sortSearchResults([...(prev ?? []), ...additions], q));
      // Reveal the freshly-fetched batch in the same VISIBLE_RESULTS increments as the reveal-only
      // path above, rather than dumping the whole new page in at once -- a network page can itself
      // be 20+ items, which is exactly the "too many at once" bug this cap exists to fix.
      setVisibleCount((v) => v + VISIBLE_RESULTS);
      if (off) {
        setOffPage((p) => p + 1);
        setOffHasMore(off.hasMore);
      }
      if (usda) {
        setUsdaPage((p) => p + 1);
        setUsdaHasMore(usda.hasMore);
      }
      if (branded) {
        setBrandedPage((p) => p + 1);
        setBrandedHasMore(branded.hasMore);
      }
    } finally {
      if (searchSeq.current === seq) setLoadingMore(false);
    }
  }

  // hallTid here is the CURRENTLY-BROWSED hall (the `hallTid` prop), not the candidate's own
  // FoodPro locationNum -- same rule the catalog-search path above already follows and for the
  // identical reason (see this component's own Props doc comment): hallTid feeds server-synced
  // hall-completion/favorite-hall derivation, so a cross-hall value here (a different real hall,
  // or a negative retail-location tid) would misattribute credit to a hall the user isn't
  // browsing. The candidate's own hallTid is used only for the public.dishes upsert server-side
  // (lookup-dish/index.ts), never staged into the client's plate/log pipeline.
  function candidatesToResults(candidates: LookupDishCandidate[]): PlateSearchResult[] {
    return candidates.map((c) => ({
      kind: "umass",
      dish: { dishName: labelLookupCandidate(c, candidates), hallTid, nutrition: c.nutrition },
    }));
  }

  // Manual fallback only -- never fired automatically (that would spend lookup-dish's global,
  // Free-tier-protecting rate-limit budget on every keystroke). Merges a hit straight into the
  // existing `results` buffer as ordinary "umass" PlateSearchResult rows -- same badge/row/detail
  // path as every other search source, no new UI chrome. Gated by the same searchSeq a closed
  // sheet or a newer search bumps, so a slow response can't repaint a stale/closed search.
  async function runDirectLookup() {
    const q = query.trim();
    if (!q || directLookup === "loading") return;
    const seq = searchSeq.current;
    setDirectLookup("loading");
    // __DEV__-only: lookup-dish isn't deployed yet, so a real multi-candidate hit can't be
    // triggered over the network -- swap in STRESS_LOOKUP_CANDIDATES instead of the real round
    // trip. See that const's own comment above. The miss/rate_limited/fetching fixtures fake the
    // other two settled states plus a permanently-pending one for --record, same reasoning.
    const result: LookupDishResult =
      __DEV__ && stressFixture === "lookup-hit"
        ? { status: "hit", candidates: STRESS_LOOKUP_CANDIDATES }
        : __DEV__ && stressFixture === "lookup-miss"
          ? { status: "miss" }
          : __DEV__ && stressFixture === "lookup-rate-limited"
            ? { status: "rate_limited" }
            : __DEV__ && stressFixture === "lookup-fetching"
              ? await new Promise<LookupDishResult>(() => {})
              : await lookupDishLive(supabase, q);
    if (searchSeq.current !== seq) return;
    if (result.status === "hit") {
      const additions = candidatesToResults(result.candidates);
      setResults((prev) => sortSearchResults([...(prev ?? []), ...additions], q));
      setVisibleCount((v) => v + additions.length);
      setDirectLookup("idle");
    } else {
      setDirectLookup(result.status);
    }
  }

  // Drives runDirectLookup automatically once the sheet is visible under the stress fixture --
  // screenshot.sh has no text-input gesture to type a query and tap the button through, so this
  // pre-seeds the search box the same way `initialQuery` already does for the menu-row-tap path,
  // then fires the real button handler (still hitting the __DEV__ branch above, not a duplicate
  // code path).
  useEffect(() => {
    if (!__DEV__ || !visible || !stressFixture || !LOOKUP_STRESS_FIXTURES.has(stressFixture)) return;
    setSearchExpanded(true);
    setQuery(STRESS_LOOKUP_QUERY);
  }, [visible, stressFixture]);
  useEffect(() => {
    if (!__DEV__ || !visible || !stressFixture || !LOOKUP_STRESS_FIXTURES.has(stressFixture) || query !== STRESS_LOOKUP_QUERY) return;
    void runDirectLookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runDirectLookup closes over query/directLookup by design (same as its button's onPress); re-running this effect on those would loop.
  }, [visible, stressFixture, query]);

  // Same auto-drive pattern as the lookup-hit pair above, for decision 5's catalog-refresh
  // fixture: pre-seed the search box, then fire runSearch() for real (still hitting the __DEV__
  // branch in the mount effect above for the refresh's own timing/result, not a duplicate splice
  // path) -- screenshot.sh has no gesture for typing+submitting a query, so this stands in for
  // that keystroke + Search tap.
  useEffect(() => {
    if (!__DEV__ || !visible || stressFixture !== STRESS_CATALOG_REFRESH_FIXTURE) return;
    setSearchExpanded(true);
    setQuery(STRESS_CATALOG_REFRESH_QUERY);
  }, [visible, stressFixture]);
  useEffect(() => {
    if (!__DEV__ || !visible || stressFixture !== STRESS_CATALOG_REFRESH_FIXTURE || query !== STRESS_CATALOG_REFRESH_QUERY || searching || results !== null) return;
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runSearch closes over query/searching by design (same as the Search button's onPress); re-running this effect on those would loop.
  }, [visible, stressFixture, query]);

  // Stays mounted (state, in-flight searches, the keyboard subscription) while closed; only the
  // rendered overlay goes away -- same as the Modal-visible=false it replaces. modalVisible (not
  // `visible`) so the close animation gets its frames before the tree is dropped.
  if (!modalVisible) return null;

  return (
    // accessibilityViewIsModal: iOS side of the a11y fencing a Modal window used to provide
    // (VoiceOver stays inside the overlay); Android's side is the caller's behindSheetA11yProps
    // wrapper around its background content.
    <GestureHandlerRootView style={styles.backdrop} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      {/* keyboardStyle (tracked above via useAnimatedKeyboard) pushes the sheet up in lockstep
      with the keyboard's own live height. */}
      <Animated.View testID="keyboardFollowWrapper" style={keyboardStyle}>
        <Animated.View style={[styles.sheet, panelStyle, { paddingBottom: spacing(6) + insets.bottom }]}>
          <GestureDetector gesture={gesture}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          <View style={[styles.header, searchExpanded && styles.headerExpanded]}>
            <Text style={styles.title}>Your Plate</Text>
            {contextLabel ? <Text style={styles.context}>{contextLabel}</Text> : null}
          </View>

          <ScrollView ref={scrollRef} style={styles.scroll} keyboardShouldPersistTaps="handled">
            {searchExpanded ? (
              <View style={styles.addSection} testID="addSection">
                {/* SearchExpandedHeader.dc.html:35-38 -- the app's one backChevron style token
                (also used by CustomFoodForm.tsx/NutritionLabel.tsx), paired with a "Search"
                section title in a proper header row, same as those two and
                SearchResultDetail.dc.html:18-21 already do. */}
                <View style={styles.searchHeader}>
                  <Pressable
                    onPress={() => {
                      setSearchExpanded(false);
                      // The results list (and its rows' FadeIn `entering`) unmounts here and
                      // remounts fresh on re-expand -- clear "just arrived" so a row already seen
                      // once doesn't replay the arrival animation every time the panel reopens.
                      setJustArrivedKeys(new Set());
                    }}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                  >
                    <Text style={styles.backChevron}>‹</Text>
                  </Pressable>
                  <Text style={styles.searchHeaderTitle}>Search</Text>
                </View>
                <View style={styles.searchRow}>
                  <View style={styles.searchInputBox}>
                    {/* Magnifying-glass glyph, PlateSheetResults.dc.html:37 /
                    SearchExpandedHeader.dc.html:42. */}
                    <Svg width={fs(14)} height={fs(14)} viewBox="0 0 14 14" fill="none" testID="searchIcon">
                      <Circle cx={6} cy={6} r={4.2} stroke={withOpacity(colors.ink900, 50)} strokeWidth={1.4} />
                      <Path d="M9.5 9.5L12.5 12.5" stroke={withOpacity(colors.ink900, 50)} strokeWidth={1.4} strokeLinecap="round" />
                    </Svg>
                    <TextInput
                      ref={searchInputRef}
                      style={styles.searchInput}
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search for a food"
                      placeholderTextColor={withOpacity(colors.ink900, 45)}
                      onSubmitEditing={() => runSearch()}
                      // This box is now the top of its own full-pane view (once a search has run,
                      // results/footer rows push it below the fold) -- scroll it to the end so the
                      // query stays visible while typing.
                      onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                      returnKeyType="search"
                    />
                  </View>
                  {/* PlateSheetResults.dc.html:40 / SearchExpandedHeader.dc.html:45 -- solid
                  #3b0a0f fill with an Oswald/600/12px/uppercase label, darker than
                  buttonColors("primary")'s default maroon600 -- same "primary variant +
                  style/textStyle override" pattern as CustomFoodForm.tsx's Save button
                  (saveButton/saveButtonText) for its own #3b0a0f artboard button. */}
                  <Button
                    variant="primary"
                    size="sm"
                    style={styles.searchButton}
                    textStyle={styles.searchButtonText}
                    onPress={() => runSearch()}
                    // Only blocks resubmitting the SAME still-in-flight query -- a genuinely
                    // different one must stay tappable so it can supersede the running search
                    // (decision 6, plate-search-semantics.md), same guard runSearch itself applies.
                    disabled={!query.trim() || (searching && query.trim() === inFlightQueryRef.current)}
                  >
                    Search
                  </Button>
                </View>
                {searching && (
                  <View style={styles.searchSpinner}>
                    <Spinner size={fs(14)} color={colors.maroon600} durationMs={durations.searchSpin} trackOpacity={20} />
                  </View>
                )}
                {searchError && <Text style={styles.searchError}>Search failed: {searchError}</Text>}
                {results?.length === 0 && !searching && <Text style={styles.searchHint}>No matches.</Text>}
                {/* lookup-dish's fetching/rate_limited states render as ONE inline row at the
                exact spot a UMass-catalog match would occupy in the list below -- not a
                blocking full-screen state, and OFF/USDA/Custom rows already found keep showing
                beneath it. Same SLOT for both (this is the only inline lookup-state indicator,
                and resolving fetching -> rate_limited doesn't reorder or duplicate anything
                around it), but each state gets its own gold-spinner vs. gray-clock treatment
                per SearchLookupStates.dc.html (43/46 vs 71/73) -- they're not meant to look
                identical. miss renders no row here at all -- the standing "Create a custom
                food" footer further below is its resolution, brief foodpro-menu-expansion
                task 4. */}
                {(directLookup === "loading" || directLookup === "rate_limited") && (
                  <View
                    style={directLookup === "loading" ? styles.lookupStateRowFetching : styles.lookupStateRowRateLimited}
                    testID="lookupStateRow"
                  >
                    {directLookup === "loading" ? (
                      <>
                        <Spinner size={fs(14)} color={colors.maroon600} durationMs={durations.searchSpin} trackOpacity={20} />
                        <Text style={styles.lookupStateTextFetching}>Looking up {query.trim()}…</Text>
                      </>
                    ) : (
                      <>
                        {/* SearchLookupStates.dc.html:72 -- a static clock, not the fetching spinner. */}
                        <Svg width={fs(16)} height={fs(16)} viewBox="0 0 16 16" fill="none" testID="lookupStateClockIcon">
                          <Circle cx={8} cy={8} r={6} stroke={withOpacity(colors.ink900, 40)} strokeWidth={1.5} />
                          <Path d="M8 5v3.5l2.3 1.3" stroke={withOpacity(colors.ink900, 40)} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                        </Svg>
                        <Text style={styles.lookupStateTextRateLimited}>Live lookups are maxed out for the hour. Try again shortly, or search what&apos;s already on the menu.</Text>
                      </>
                    )}
                  </View>
                )}
                {results?.slice(0, visibleCount).map((r) => {
                  const key = plateSearchResultKey(r);
                  const detail = plateSearchResultDetail(r);
                  const badge = BADGE_INFO[r.kind];
                  return (
                    // Decision 5: a row a live catalog-refresh just spliced into an already-open
                    // search fades in (same entrance halls/[slug].tsx's own expanded-content
                    // reveal uses) instead of silently re-sorting/appearing with no signal --
                    // `entering` undefined for every other (ordinary search-hit) row is a no-op.
                    <Animated.View key={key} style={styles.resultRow} entering={justArrivedKeys.has(key) ? FadeIn.duration(durations.rowExpandIn) : undefined}>
                      <Pressable
                        style={styles.resultInfo}
                        onPress={() => onShowResultDetail(r)}
                        accessibilityRole="button"
                        // The badge is visual-only, so the source distinction is spelled out here
                        // too, or a screen-reader user gets two indistinguishable "View Pizza"
                        // actions on a name collision. "View", not "Add" -- tapping a result opens
                        // the confirm/detail step, not an instant add.
                        accessibilityLabel={`View ${detail.dishName} (${badge.label})`}
                      >
                        <View style={styles.resultHeaderRow}>
                          <Text style={styles.resultLabel}>{detail.dishName}</Text>
                          <View style={[styles.badge, { backgroundColor: badge.fill }]}>
                            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                          </View>
                        </View>
                        <Text style={styles.resultCalories}>
                          {Math.round(detail.nutrition.calories)} cal{isEstimatedServing(detail.nutrition) ? " · est. per 100g" : ""}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
                {(() => {
                  const total = results?.length ?? 0;
                  const hiddenFetched = total - visibleCount;
                  const canFetchMore = offHasMore || usdaHasMore || brandedHasMore;
                  if (hiddenFetched <= 0 && !canFetchMore) return null;
                  // Decision 4 (plate-search-semantics.md): always "Load More" -- the underlying
                  // reveal-buffered-vs-fetch-next-page split above is unchanged, but a count in the
                  // label leaked that implementation distinction into user-facing copy (confusing
                  // when it silently changed from "Load 5 More" to "Load 20 More" mid-session).
                  const label = loadingMore ? "Loading…" : "Load More";
                  return (
                    <Button variant="ghost" size="sm" style={styles.loadMoreButton} textStyle={styles.loadMoreButtonText} onPress={loadMore} disabled={loadingMore}>
                      {label}
                    </Button>
                  );
                })()}
                {/* Manual, explicit fallback to lookup-dish's on-demand FoodPro Web INA lookup --
                never fires on its own. Unconditionally available once a search finishes (decision
                3, plate-search-semantics.md) -- it used to hide the moment ANY umass-kind result
                existed anywhere in `results`, even an unrelated catalog hit sharing a keyword with
                the query and nothing to do with whether the food the user actually wants is
                present ("I really don't see it at the bottom at times"). Hidden while a lookup is
                already in flight -- the inline row above is the only fetching indicator (exactly
                one, not this button too); shown again for idle/miss/rate_limited so retry always
                stays one manual tap away, never a timer. */}
                {results !== null && !searching && directLookup !== "loading" && (
                  <View style={styles.directLookup}>
                    <Button variant="ghost" size="sm" onPress={runDirectLookup} accessibilityLabel="Search UMass Dining directly">
                      Search UMass Dining directly
                    </Button>
                  </View>
                )}
                {/* Standing footer row -- shown whenever a search has actually run, whether or
                not it found anything, since no database this sheet searches has every food. Also
                shown on the all-rejected error branch, when the user most needs this escape hatch.
                `!searching` is required here (not on the direct-lookup gate above, which already
                has its own) -- 3b's streaming means `results` can go non-null WHILE other groups
                are still in flight, and this footer's "no database has every food" framing reads
                as a post-search summary, not a live-while-typing state, so it must wait for the
                whole search to actually finish. */}
                {((results !== null && !searching) || searchError !== null) && (
                  <Pressable
                    style={styles.customFoodRow}
                    onPress={() => onOpenCustomFoodForm(query.trim() || undefined)}
                    accessibilityRole="button"
                    accessibilityLabel="Create a custom food"
                  >
                    <Text style={styles.customFoodRowIcon}>+</Text>
                    <Text style={styles.customFoodRowText}>Can&apos;t find it? Create a custom food</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              // Idle state: item list/totals/LOG button, then the idle "Add something else" row
              // (PlateExpanded.dc.html:87-93). searchExpanded now gates this ENTIRE pane body
              // (3a) -- expanding search replaces all of it with just the back button + search
              // block above, rather than leaving this mounted underneath a swapped-in search box.
              <>
                <View style={styles.itemList}>
                  {plate.map((entry) => (
                    <View key={entry.key} style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemLabel}>{entry.label}</Text>
                        <Text style={styles.itemCalories}>
                          {Math.round(entry.nutrition.calories)} cal each{isEstimatedServing(entry.nutrition) ? " · est. per 100g" : ""}
                        </Text>
                      </View>
                      <View style={[styles.stepper, editingKey === entry.key && styles.stepperEditing]}>
                        <Pressable
                          style={[styles.stepperButton, editingKey === entry.key && styles.stepperButtonEditing]}
                          onPress={() => onStep(entry.key, -1)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove one ${entry.label}`}
                        >
                          <Text style={styles.stepperButtonText}>−</Text>
                        </Pressable>
                        {editingKey === entry.key ? (
                          <TextInput
                            style={styles.stepperInput}
                            value={editingText}
                            onChangeText={setEditingText}
                            keyboardType="decimal-pad"
                            autoFocus
                            selectTextOnFocus
                            onSubmitEditing={commitEditingCount}
                            onBlur={commitEditingCount}
                            accessibilityLabel={`Servings for ${entry.label}`}
                          />
                        ) : (
                          <Pressable onPress={() => beginEditingCount(entry)} accessibilityRole="button" accessibilityLabel={`Edit servings for ${entry.label}`}>
                            <Text style={styles.stepperCount}>{formatServings(entry.count)}</Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={[styles.stepperButton, editingKey === entry.key && styles.stepperButtonEditing]}
                          onPress={() => onStep(entry.key, 1)}
                          accessibilityRole="button"
                          accessibilityLabel={`Add one ${entry.label}`}
                        >
                          <Text style={styles.stepperButtonText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.divider} />

                <View style={styles.totalsRow}>
                  <View style={styles.totalCell}>
                    <Stat label="Calories" value={String(Math.round(totals.calories))} />
                  </View>
                  <View style={styles.totalCell}>
                    <Stat label="Protein" value={`${totals.proteinG.toFixed(0)}g`} />
                  </View>
                  <View style={styles.totalCell}>
                    <Stat label="Carbs" value={`${totals.totalCarbG.toFixed(0)}g`} />
                  </View>
                  <View style={styles.totalCell}>
                    <Stat label="Fat" value={`${totals.totalFatG.toFixed(0)}g`} />
                  </View>
                </View>

                <Button variant="primary" style={styles.logButton} textStyle={styles.logButtonText} onPress={onLog} disabled={plate.length === 0}>
                  {`LOG ${formatServings(itemCount)} ${itemCount === 1 ? "ITEM" : "ITEMS"}`}
                </Button>

                {/* The artboard's hint copy mentions barcode scanning, but no such feature exists
                in this app, so that clause is dropped. */}
                <Pressable
                  style={[styles.addSection, styles.addSectionIdle]}
                  onPress={() => setSearchExpanded(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add something else"
                  testID="addSection"
                >
                  {/* Magnifying-glass glyph per PlateExpanded.dc.html:87. */}
                  <Svg width={fs(20)} height={fs(20)} viewBox="0 0 20 20" fill="none">
                    <Circle cx={9} cy={9} r={5.5} stroke={colors.maroon600} strokeWidth={1.6} />
                    <Path d="M13.5 13.5L17 17" stroke={colors.maroon600} strokeWidth={1.6} strokeLinecap="round" />
                  </Svg>
                  <View style={styles.addIdleText}>
                    <Text style={styles.addIdleTitle}>Add something else</Text>
                    <Text style={styles.addIdleHint}>Search for foods not on the menu.</Text>
                  </View>
                </Pressable>
              </>
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  // Covers the whole screen from inside the caller's root View. elevation: Android draws siblings
  // in elevation order before tree order, so without it the hall screen's filter FAB (elevation 6)
  // would paint over the scrim; 8 matches the sheet's own elevation below.
  backdrop: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", elevation: 8 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: withOpacity(colors.ink900, 50) },
  sheet: {
    backgroundColor: colors.paper50,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: spacing(2.5),
    paddingHorizontal: spacing(5),
    maxHeight: fs(640),
    // PlateExpanded.dc.html:27 & ServingsG.dc.html:27 -- box-shadow: 0 -8px 24px rgba(36,26,20,0.25).
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  // paddingVertical spacing(5), ~20dp a side -- the bare 40x4 pill alone is too small a touch/drag target.
  handleRow: { alignItems: "center", paddingVertical: spacing(5), marginBottom: spacing(2.5) },
  handle: { width: fs(40), height: 4, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 20) },
  // marginBottom 14 (spacing(3.5)), matching PlateExpanded.dc.html:27's uniform 14px panel gap --
  // the idle state's own value. Every OTHER property here (flexDirection/justifyContent/
  // alignItems) is identical on SearchExpandedHeader.dc.html:30's copy of this same row, so only
  // the margin needs a state-aware override (headerExpanded) below.
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: spacing(3.5) },
  // SearchExpandedHeader.dc.html:24's panel gap is 10px (spacing(2.5)), not PlateExpanded.dc.html's
  // 14px -- a different artboard for the expanded/search state, per
  // docs/briefs/platesheet-search-panel-spacing-gap.md. addSection no longer carries a matching
  // marginTop (moved to addSectionIdle, see below), so this alone sets the header->addSection gap.
  headerExpanded: { marginBottom: spacing(2.5) },
  title: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  context: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  scroll: { flexGrow: 0 },

  itemList: { gap: spacing(2.5) },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing(2.5) },
  itemInfo: { flex: 1, gap: 1 },
  itemLabel: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  itemCalories: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 60) },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: radii.pill,
  },
  stepperButton: { width: fs(42), height: fs(44), alignItems: "center", justifyContent: "center" },
  // ServingsG.dc.html:56-57 -- narrower 38px +/- buttons, only for the row in edit mode.
  stepperEditing: { gap: spacing(1.5), paddingHorizontal: 3 },
  stepperButtonEditing: { width: fs(38) },
  stepperButtonText: { fontSize: fs(18), color: colors.maroon600 },
  // minWidth 34 fits "1.5" without the pill visibly resizing on every fractional count.
  stepperCount: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600", minWidth: 34, textAlign: "center", color: colors.ink900 },
  // ServingsG.dc.html:58-59 -- minWidth 46/height 32/radius 8, text 15px/#3b0a0f.
  stepperInput: {
    fontFamily: fonts.mono,
    fontSize: fs(15),
    fontWeight: "600",
    minWidth: fs(46),
    height: fs(32),
    textAlign: "center",
    color: colors.maroon900,
    borderWidth: 1.5,
    borderColor: colors.gold500,
    borderRadius: 8,
    paddingHorizontal: spacing(1),
  },
  divider: { height: 1, backgroundColor: withOpacity(colors.ink900, 12), marginVertical: spacing(3.5) },

  totalsRow: { flexDirection: "row", gap: spacing(2.5), marginBottom: spacing(3.5) },
  totalCell: { flex: 1 },

  logButton: { height: fs(52), borderRadius: radii.md },
  logButtonText: { fontFamily: fonts.display600, fontSize: fs(16), letterSpacing: 1, textTransform: "uppercase" },

  // Shared by both the idle "Add something else" row and the expanded search block -- audited
  // (docs/briefs/platesheet-search-panel-spacing-gap.md) against BOTH artboards it's dual-purposed
  // for, not just the property a report happened to name:
  //  - marginTop/borderRadius/paddingVertical/paddingHorizontal/minHeight are all idle-pill-only
  //    (PlateExpanded.dc.html:87-93's asymmetric 12px/14px padding, 44px min-height, dashed
  //    border) -- SearchExpandedHeader.dc.html has no wrapping box at all around its header/input
  //    rows, so all five moved to addSectionIdle below; this shared object carries none of them.
  //  - `gap` stays here: it's the internal rhythm among addSection's OWN children once a search
  //    has actually run (spinner/error/results/footer rows, spec'd by PlateSheetResults.dc.html,
  //    a separate artboard this brief doesn't cover) -- unaffected by this fix. The one pair this
  //    brief DOES cover (searchHeader -> searchRow) needs 10px total, not this shared 4px, so
  //    searchHeader below adds the extra 6px itself rather than bumping this shared value and
  //    disturbing every other row spacing PlateSheetResults.dc.html already governs.
  addSection: {
    gap: spacing(1),
  },
  addSectionIdle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: radii.md,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    minHeight: fs(44),
    // PlateExpanded.dc.html's own 14px panel gap, between logButton and this row -- idle-only,
    // moved here from the shared addSection object above (SearchExpandedHeader.dc.html's expanded
    // state supplies its own 10px via headerExpanded instead, not this).
    marginTop: spacing(3.5),
  },
  addIdleText: { flexShrink: 1, gap: 0 },
  addIdleTitle: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon600 },
  addIdleHint: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
  // SearchExpandedHeader.dc.html:35-38 -- the back chevron sits in a header row with a "Search"
  // section title, the same chevron+title convention CustomFoodForm.tsx's own header already
  // uses, instead of floating alone outside any row. Smaller than CustomFoodForm's full top-of-
  // screen title (13px/600 vs 20px/700) -- this one lives inside the already-compact addSection
  // panel, not a standalone modal header.
  // marginBottom 6 (spacing(1.5)) on top of addSection's own 4px gap = 10px total to searchRow
  // below, matching SearchExpandedHeader.dc.html:24's 10px panel gap for this pair specifically
  // (see addSection's own comment above for why the shared gap itself stays 4px).
  searchHeader: { flexDirection: "row", alignItems: "center", gap: spacing(2.5), paddingVertical: fs(2), marginBottom: spacing(1.5) },
  searchHeaderTitle: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  // Same backChevron the app's other in-sheet close buttons use (CustomFoodForm.tsx,
  // NutritionLabel.tsx, CafePdfViewer.tsx) -- repurposed here to collapse back to idle instead of
  // closing the whole sheet.
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  searchRow: { flexDirection: "row", gap: spacing(2), alignItems: "center" },
  // PlateSheetResults.dc.html:40 / SearchExpandedHeader.dc.html:45 -- #3b0a0f fill, 6px radius,
  // darker than buttonColors("primary")'s maroon600 default. fontWeight "400" cancels Button's own
  // base 600 weight, which would fake-bold display600's already-600 Oswald family (same reasoning
  // as CustomFoodForm.tsx's saveButtonText).
  searchButton: { borderRadius: radii.md, backgroundColor: colors.maroon900 },
  searchButtonText: { fontFamily: fonts.display600, fontSize: fs(12), letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "400" },
  // PlateSheetResults.dc.html:36 -- the border wraps the icon+input box itself, not the whole
  // expanded panel (addSection above no longer carries one).
  searchInputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 25),
    borderRadius: radii.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body400,
    color: colors.ink900,
  },
  searchSpinner: { marginTop: spacing(2) },
  searchError: { fontFamily: fonts.body400, fontSize: fs(13), color: "#b00020", marginTop: spacing(2) },
  searchHint: { fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.ink900, 55), marginTop: spacing(2) },
  directLookup: { alignItems: "center", gap: spacing(1.5), marginTop: spacing(2) },
  // lookup-dish's fetching/rate_limited states occupy the same SLOT in the results list (brief
  // foodpro-menu-expansion task 4) but are two distinct pills per SearchLookupStates.dc.html, not
  // one shared style -- a gold-tinted pill while fetching (line 43) vs. a gray-tinted pill once
  // rate-limited (line 71). Neither has the ordinary result row's bottom hairline.
  lookupStateRowFetching: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(0.5),
    backgroundColor: withOpacity(colors.gold500, 8),
    borderRadius: radii.md,
  },
  lookupStateRowRateLimited: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2.5),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    backgroundColor: withOpacity(colors.ink900, 5),
    borderRadius: radii.md,
  },
  // Distinct text treatments per SearchLookupStates.dc.html -- fetching (line 46) is 13px with no
  // line-height; rate_limited (line 73) is 12px with a 1.4 line-height ratio. `fs()`/`spacing()`
  // scale by width, not by a CSS ratio, so the line-height is computed here (fontSize * 1.4),
  // never a bare `lineHeight: 1.4` (that would render as ~1.4dp, not ~17px).
  lookupStateTextFetching: { flex: 1, fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.ink900, 65) },
  lookupStateTextRateLimited: { flex: 1, fontFamily: fonts.body400, fontSize: fs(12), lineHeight: fs(12 * 1.4), color: withOpacity(colors.ink900, 65) },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(2),
    paddingVertical: spacing(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: withOpacity(colors.ink900, 15),
  },
  resultInfo: { flex: 1, gap: 1 },
  resultHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  // flexShrink: 1 -- without it this Text refuses to shrink below its own content width (RN/Yoga
  // default), so a long dish/product name pushes the sibling kind badge off the row's right edge.
  resultLabel: { flexShrink: 1, fontFamily: fonts.body400, fontSize: fs(14), color: colors.ink900 },
  resultCalories: { fontFamily: fonts.mono, fontSize: fs(13), color: withOpacity(colors.ink900, 60) },
  // PlateSheetResults.dc.html:49,60,71,82,93 -- filled pill, no border, 9px/700 sans-serif at
  // 0.4px letterspacing, 2px/6px padding. fonts.body600 is the closest loaded weight to the spec's
  // 700 -- an explicit fontWeight on a lighter family fake-bolds it on Android.
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: fonts.body600, fontSize: fs(9), letterSpacing: 0.4, textTransform: "uppercase" },
  // PlateSheetResults.dc.html:99 -- Oswald/600/12px uppercase with a visible border.
  loadMoreButton: { alignSelf: "center", marginTop: spacing(1.5), borderWidth: 1, borderColor: withOpacity(colors.ink900, 20), borderRadius: 6 },
  loadMoreButtonText: { fontFamily: fonts.display600, fontSize: fs(12), letterSpacing: 0.8, textTransform: "uppercase", color: withOpacity(colors.ink900, 65) },
  // PlateSheetResults.dc.html:103 -- a dashed box with a "+" icon.
  customFoodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2.5),
    marginTop: spacing(1.5),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: 6,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
  },
  customFoodRowIcon: { fontSize: fs(16), fontWeight: "700", color: colors.maroon600 },
  customFoodRowText: { flex: 1, fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon600 },
});
