import { DINING_HALLS, favoriteKey, openStatus, type DiningHoursFeed, type Favorite, type RetailLocationHours } from "@udine/shared";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CafePdfViewer } from "../components/CafePdfViewer";
import { CafeSheet } from "../components/CafeSheet";
import { OfflineLine } from "../components/OfflineLine";
import { SkeletonBar } from "../components/Skeleton";
import { SectionHeader } from "../components/ui";
import { PaneStack } from "../components/PaneStack";
import { PressDim } from "../components/Press";
import { colors, fonts, fs, hallGradientClosed, hallGradients, radii, spacing, withOpacity } from "../lib/theme";
import { deriveHomeHero, formatHeroLine, formatLocationChip, offlineUpdatedLine, retailOpenStatus, type HomeHero } from "../lib/homeHero";
import { grabRouteFor, grabStripState } from "../lib/grabStrip";
import { takePendingCafeSheet } from "../lib/cafeSheetHandoff";
import { getCachedHours, fetchHoursAndCache } from "../lib/menuHoursCache";
import { HOME_PANE_INDEX } from "../lib/paneShell";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { EventsPane } from "../panes/EventsPane";
import { YouPane } from "../panes/YouPane";

const favoritesStorage = new SqliteFavoritesStorage();

// #90 canvas doesn't carry these (its Home artboard is hero + hall cards + cafés/markets), but
// dropping them would strand /filters, /favorites, /press, /newsletter, /export with no in-app
// entry point. MVP cut (temporary, see archive/full-features): rank dishes and notifications are
// shelved along with ranking/friends/account; export stays reachable here now that its old home
// (behind /privacy's own EXPORT row) is gone too.
const QUICK_LINKS: { href: string; label: string }[] = [
  { href: "/filters", label: "Dietary filters" },
  { href: "/favorites", label: "Favorites" },
  { href: "/press", label: "Press" },
  { href: "/newsletter", label: "Newsletter" },
  { href: "/export", label: "Export data" },
];

// #181: hero is null both while the very first fetch is genuinely pending (real skeleton) AND on
// the dead-end case -- fetch failed with no cache to fall back to (`error` is set instead). Those
// two null cases must render differently: `pending` distinguishes them. Without it (#181 review
// finding 3, blocking), the skeleton fell back to unconditionally whenever hero was null, so a
// fetch-failed-with-no-cache render showed the shimmer FOREVER underneath the error text -- the
// opposite of "honest": the skeleton would be promising data that will never arrive. The date line
// is known instantly either way (today's date needs no network), so it always renders regardless.
function HeroBlock({
  hero,
  now,
  offline,
  cachedAt,
  pending,
}: {
  hero: HomeHero | null;
  now: Date;
  offline: boolean;
  cachedAt: string | null;
  pending: boolean;
}) {
  const dateLine = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <View style={styles.hero}>
      <View style={styles.heroKickerRow}>
        <Text style={styles.heroKicker}>{dateLine}</Text>
        {offline && cachedAt ? <OfflineLine text={offlineUpdatedLine(new Date(cachedAt))} /> : null}
      </View>
      <View style={styles.heroRow}>
        {hero ? (
          <>
            <Text style={styles.heroTitle}>{formatHeroLine(hero).title}</Text>
            <Text style={styles.heroSubtitle}>{formatHeroLine(hero).subtitle}</Text>
          </>
        ) : pending ? (
          <SkeletonBar width={fs(160)} height={fs(40)} />
        ) : null}
      </View>
      <View style={styles.heroGoldBar} />
    </View>
  );
}

// The strip's visual box (padding + one 11px line) lands well under 44dp, especially once
// theme.fs()/spacing() shrink it further on narrow screens -- touch targets deliberately don't
// scale (theme.ts), so this hitSlop is fixed, not run through fs()/spacing(), and sized generously
// enough to clear 44dp effective height even at the smallest supported width. It's rendered as its
// own Pressable *after* the hall zone in the card's column, so its top hitSlop reaching back up
// into the hall zone's area wins hit-testing there (RN resolves overlaps in child order) without
// the two zones' Pressables needing to nest.
const GRAB_STRIP_HIT_SLOP = { top: 16, bottom: 12, left: 8, right: 8 };

/** Split hall card per the #116 canvas delta: one rounded unit, two tap zones -- the hall area
 * (opens the hall menu) and a translucent Grab 'N Go strip along the bottom of the same card
 * (opens that hall's Grab 'N Go menu, #115). Giant clipped monogram + status pill live in the hall
 * zone; the strip is a darker wash over the same gradient with a hairline top divider. Closed halls
 * get the shared washed-out gradient + dimmed name (hall zone) and a further-dimmed strip. */
function HallCard({
  hall,
  chip,
  grab,
  pending,
}: {
  hall: { slug: string; name: string; tid: number };
  chip: { open: boolean; text: string };
  grab: { open: boolean; text: string };
  /** #181: hall NAME/monogram below are always known (DINING_HALLS is static); only the
   * open/closed chip needs hoursFeed, so only it shimmers while `pending`. */
  pending: boolean;
}) {
  const gradient = chip.open ? (hallGradients[hall.slug] ?? hallGradients.worcester) : hallGradientClosed;
  return (
    <View style={styles.hallCard}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }} style={StyleSheet.absoluteFill} />

      <View style={styles.hallZone}>
        {/* #229: the pressable WRAPS the monogram/chip/name instead of sitting beside them as a
            childless absolute-fill sibling. Android's ReactTextView ignores `pointerEvents="none"`
            (not a ReactPointerEventsView -- see RN's TouchTargetHelper.kt), so the later-drawn
            Texts won hit-testing and the touch bubbled to their parent, never to a sibling
            Pressable: 6/6 device taps on the name did nothing while the one Text-free sliver
            navigated. As an ancestor, the pressable gets the bubble whichever child Android picks.
            The star stays a later *sibling* (wins its own patch) so the two targets never nest.
            `.pressd` dim (#179) is PressDim's own overlay; `style` is one object, not an array,
            because <Slot> (asChild) can't take an array style on its direct child. */}
        <Link href={`/halls/${hall.slug}`} asChild>
          <PressDim style={styles.hallZoneTap} accessibilityRole="button">
            <Text style={[styles.hallMonogram, !chip.open && styles.hallMonogramClosed]}>{hall.name.charAt(0)}</Text>
            {pending ? (
              <View style={[styles.hallChip, styles.hallChipClosed]}>
                <SkeletonBar width={fs(46)} height={fs(11)} />
              </View>
            ) : chip.text ? (
              <View style={[styles.hallChip, chip.open ? styles.hallChipOpen : styles.hallChipClosed]}>
                <Text style={[styles.hallChipText, chip.open ? styles.hallChipTextOpen : styles.hallChipTextClosed]}>{chip.text}</Text>
              </View>
            ) : null}
            <Text style={[styles.hallCardName, !chip.open && styles.hallCardNameClosed]}>{hall.name}</Text>
          </PressDim>
        </Link>
      </View>

      {/* expo-router's <Slot> (what asChild renders) clones its direct child and can't handle an
          array `style` prop there -- it needs one flattened object, unlike a plain RN Pressable
          (confirmed on-device: "[expo-router]: You are passing an array of styles to a child of
          <Slot>"). Only the pressable itself is that direct child; its own children are unaffected.
          PressDim forwards `style` straight to its own inner Pressable, so it's a drop-in here. */}
      <Link href={grabRouteFor(hall.slug) as never} asChild>
        <PressDim hitSlop={GRAB_STRIP_HIT_SLOP} style={StyleSheet.flatten([styles.grabStrip, !grab.open && styles.grabStripClosed])} accessibilityRole="button">
          <View style={styles.grabStripLeft}>
            <Text style={[styles.grabStripLabel, !grab.open && styles.grabStripTextClosed]}>GRAB &apos;N GO</Text>
            {grab.text ? <Text style={[styles.grabStripHours, !grab.open && styles.grabStripTextClosed]}>{grab.text}</Text> : null}
          </View>
          <Text style={[styles.grabStripChevron, !grab.open && styles.grabStripTextClosed]}>›</Text>
        </PressDim>
      </Link>
    </View>
  );
}

// Exported so it's independently testable (#104 review round) without pulling in EventsPane's/
// YouPane's own network- and storage-backed siblings, which the pager mounts eagerly alongside it.
export function HomePane() {
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  // #181: offline is NOT an error state (owner decision) -- `offline` + `cachedAt` drive the small
  // wifi-off line, not `error`. `error` is now reserved for the genuine dead-end: fetch failed AND
  // no cache exists to fall back to, so there's nothing else to show.
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [favoriteHallKeys, setFavoriteHallKeys] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());
  const insets = useSafeAreaInsets();
  // #245 item 8: a café with no `locationId` can never have a probed menu (cafeTapTarget's own
  // "no tid to fetch with" branch, see /cafe/[name].tsx) -- that's knowable right here, synchronously,
  // off the same hoursFeed.retail data already in hand, so those rows open CafeSheet inline instead
  // of navigating to /cafe/[name] just to land on its identical fallback-sheet-over-a-blank-screen
  // render. Cafés WITH a locationId still probe via the existing route (target.kind isn't knowable
  // until that fetch resolves).
  const [cafeSheetLoc, setCafeSheetLoc] = useState<RetailLocationHours | null>(null);
  const [cafeSheetVisible, setCafeSheetVisible] = useState(false);
  const [cafeSheetPdf, setCafeSheetPdf] = useState<{ url: string; label: string } | null>(null);

  // #243 bug B: `current` guards against a stale response winning a race -- leaving this screen
  // and refocusing it (e.g. switching panes/tabs and back) while the first focus's fetch is still
  // in flight fires a second, overlapping load(). Without this, a slow first fetch that later
  // rejects (or whose own getCachedHours() fallback resolves slowly) can land AFTER the second,
  // newer focus's fetch already succeeded -- overwriting the fresh feed with a stale cached copy
  // and showing a false offline banner. Same "current" pattern halls/[slug].tsx's item-fetch
  // effect already uses for the analogous date-stepper race.
  const load = useCallback(() => {
    let current = true;
    setNow(new Date());
    favoritesStorage.getFavorites().then((favs) => {
      if (current) setFavoriteHallKeys(new Set(favs.filter((f) => f.type === "location").map(favoriteKey)));
    });
    fetchHoursAndCache()
      .then((feed) => {
        if (!current) return;
        setHoursFeed(feed);
        setOffline(false);
        setError(null);
      })
      .catch((e) => {
        if (!current) return;
        // "offline" here really means "the last fetch failed" -- a rejected fetch as the
        // reachability signal, not a true OS-level connectivity check (no netinfo dependency in
        // this codebase). Good enough proxy: a real network error and a genuine server outage both
        // land here, and both get the same "render from what we've got" treatment.
        getCachedHours()
          .then((cached) => {
            if (!current) return;
            if (cached) {
              setHoursFeed(cached.feed);
              setOffline(true);
              setCachedAt(cached.fetchedAt);
              setError(null);
            } else {
              setError(String(e));
            }
          })
          .catch(() => {
            if (current) setError(String(e));
          });
      });
    return () => {
      current = false;
    };
  }, []);

  // One useFocusEffect registration, not two: `load` returns a cleanup ("current" guard), and this
  // repo's useFocusEffect test shims (e.g. homePaneStaleFocusRace.test.tsx) capture "the" latest
  // registered callback by hook-call order -- a second, separate useFocusEffect call would shadow
  // `load`'s in those shims, not run alongside it.
  //
  // The pickup half handles a café/[name] hand-off (cafeSheetHandoff.ts): that screen calls
  // requestCafeSheet then router.back() the instant it resolves to a sheet-only outcome (no
  // locationId, or a locationId whose probe came back empty -- e.g. a standing-menu-only
  // location), so this fires the moment Home regains focus from that pop. Reads `hoursFeed` fresh
  // each time (the dependency array below, not a one-shot [] effect) since the café the request
  // names must be looked up in whatever hours feed Home currently has loaded; takePendingCafeSheet
  // clears itself, so a re-fire with nothing pending is just a no-op.
  useFocusEffect(
    useCallback(() => {
      const cleanup = load();
      const pendingName = takePendingCafeSheet();
      if (pendingName) {
        const loc = hoursFeed?.retail?.find((r) => r.name === pendingName);
        if (loc) {
          setCafeSheetLoc(loc);
          setCafeSheetVisible(true);
        }
      }
      return cleanup;
    }, [load, hoursFeed]),
  );

  // Home currently has no UI calling this -- the hall-card star that used to be its only trigger
  // was removed to match the artboard. Kept (with favoriteHallKeys/favoritesStorage below) because
  // dish ranking, per its own design, derives favorite halls into this same storage -- a future
  // replacement entry point wires back into this, not a rebuild.
  async function toggleHall(hallTid: number) {
    const favorite: Favorite = { type: "location", hallTid };
    const key = favoriteKey(favorite);
    if (favoriteHallKeys.has(key)) {
      await favoritesStorage.removeFavorite(favorite);
    } else {
      await favoritesStorage.addFavorite(favorite);
    }
    favoritesStorage.getFavorites().then((favs) => {
      setFavoriteHallKeys(new Set(favs.filter((f) => f.type === "location").map(favoriteKey)));
    });
  }

  const hero = hoursFeed ? deriveHomeHero(hoursFeed.halls, now) : null;
  // #181: honest skeleton -- the 4 hall names + monograms below render unconditionally from
  // DINING_HALLS regardless of `pending` (known without the network); only each hall's OPEN/CLOSED
  // chip (needs hoursFeed) shimmers while pending.
  const pending = !hoursFeed && !error;

  return (
    <>
      <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + fs(52) + spacing(2.5) }]}>
      {/* error only reaches here on the genuine dead end -- fetch failed AND no cache exists.
          Anything with a cache falls back to `offline` (see HeroBlock) instead, per #181's owner
          decision that offline is not an error state. */}
      {error && <Text style={styles.error}>Couldn&apos;t load dining hours: {error}</Text>}
      <HeroBlock hero={hero} now={now} offline={offline} cachedAt={cachedAt} pending={pending} />

      <View style={styles.hallList}>
        {DINING_HALLS.map((hall) => {
          const hallHours = hoursFeed?.halls.find((h) => h.hallTid === hall.tid);
          const chip = hallHours ? formatLocationChip(openStatus(hallHours, now)) : { open: false, text: "" };
          const grab = grabStripState(hoursFeed?.retail ?? [], hall.name, now);
          return <HallCard key={hall.slug} hall={hall} chip={chip} grab={grab} pending={pending} />;
        })}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Cafés & Markets" />
        <View style={styles.retailList}>
          {/* #177: café/market rows were display-only -- now tappable (chevron per the canvas),
              probing that location's menu at tap time (never precomputed, see cafe/[name].tsx's own
              doc comment on the issue's runtime model). */}
          {(hoursFeed?.retail ?? []).map((loc) => {
            const chip = formatLocationChip(retailOpenStatus(loc, now));
            const row = (
              <View style={styles.retailInfo}>
                <Text style={styles.retailName}>{loc.name}</Text>
                <Text style={[styles.retailStatus, chip.open ? styles.retailStatusOpen : styles.retailStatusClosed]}>{chip.text}</Text>
              </View>
            );
            if (loc.locationId === undefined) {
              return (
                <Pressable
                  key={loc.name}
                  style={styles.retailRow}
                  onPress={() => {
                    setCafeSheetLoc(loc);
                    setCafeSheetVisible(true);
                  }}
                  accessibilityRole="button"
                >
                  {row}
                  <Text style={styles.retailChevron}>›</Text>
                </Pressable>
              );
            }
            return (
              <Link key={loc.name} href={`/cafe/${encodeURIComponent(loc.name)}`} asChild>
                <Pressable style={styles.retailRow} accessibilityRole="button">
                  {row}
                  <Text style={styles.retailChevron}>›</Text>
                </Pressable>
              </Link>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="More" />
        <View style={styles.quickLinks}>
          {QUICK_LINKS.map((link) => (
            <Link key={link.href} href={link.href as never} asChild>
              <Pressable style={styles.quickLink} accessibilityRole="button">
                <Text style={styles.quickLinkText}>{link.label}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>
      </ScrollView>
      {cafeSheetLoc ? (
        <CafeSheet
          visible={cafeSheetVisible && !cafeSheetPdf}
          loc={cafeSheetLoc}
          now={now}
          onClose={() => setCafeSheetVisible(false)}
          onOpenPdf={(url, label) => setCafeSheetPdf({ url, label })}
        />
      ) : null}
      {cafeSheetPdf ? (
        <CafePdfViewer url={cafeSheetPdf.url} label={cafeSheetPdf.label} cafeName={cafeSheetLoc?.name ?? ""} onClose={() => setCafeSheetPdf(null)} />
      ) : null}
    </>
  );
}

/**
 * The 3-pane shell (Events ← Home → You). #179 replaced the horizontal-ScrollView pager with the
 * artboard's shared-axis transition (see PaneStack) — panes are stacked, not a translating strip,
 * so there's no scroll offset/contentSize race to land on Home any more (the #f5f0d5b bug this
 * used to guard against). Landing on Home is now just PaneStack's own Animated.Values starting AT
 * HOME_PANE_INDEX (see its doc comment).
 */
export default function PaneShellScreen() {
  const [activeIndex, setActiveIndex] = useState(HOME_PANE_INDEX);
  const insets = useSafeAreaInsets();

  // MVP cut (temporary, see archive/full-features): the first-launch push to /login (#96/#278) is
  // shelved along with login.tsx/redirect.tsx and the rest of account -- nothing in the kept
  // surface needs a session, so there's no first-run gate left to run.

  return (
    <PaneStack
      activeIndex={activeIndex}
      onActiveIndexChange={setActiveIndex}
      topInset={insets.top}
      panes={[<EventsPane key="events" />, <HomePane key="home" />, <YouPane key="you" />]}
    />
  );
}

const styles = StyleSheet.create({
  paneScroll: { flex: 1, backgroundColor: colors.cream100 },
  paneContainer: { paddingHorizontal: spacing(5), paddingBottom: spacing(10) },

  error: { color: "#b00020", fontFamily: fonts.body400, marginVertical: spacing(3) },

  hero: { paddingTop: spacing(1), paddingBottom: spacing(3.5) },
  heroKickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(0.5) },
  heroKicker: {
    fontFamily: fonts.body600,
    fontSize: fs(12),
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: withOpacity(colors.ink900, 55),
  },
  heroRow: { flexDirection: "row", alignItems: "baseline", gap: spacing(3) },
  heroTitle: {
    fontFamily: fonts.display700,
    fontSize: fs(44),
    lineHeight: fs(48),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  heroSubtitle: { flexShrink: 1, fontFamily: fonts.body500, fontSize: fs(13), color: withOpacity(colors.ink900, 65) },
  heroGoldBar: { marginTop: spacing(1.5), height: 3, width: 72, backgroundColor: colors.gold500 },

  hallList: { gap: spacing(2.5) },
  // No fixed height on the outer card any more -- it's now hallZone (fixed) + grabStrip (intrinsic)
  // stacked in a column, per #116's split-card canvas delta.
  hallCard: { borderRadius: radii.md, overflow: "hidden" },
  hallZone: { position: "relative", height: fs(76) },
  hallZoneTap: { flex: 1, justifyContent: "flex-end" },
  hallMonogram: {
    position: "absolute",
    right: fs(-8),
    top: fs(-24),
    fontFamily: fonts.display700,
    fontSize: fs(100),
    lineHeight: fs(100),
    color: withOpacity(colors.paper50, 8),
  },
  hallMonogramClosed: { color: withOpacity(colors.paper50, 6) },
  hallCardName: {
    paddingHorizontal: spacing(3.5),
    paddingBottom: spacing(2),
    fontFamily: fonts.display600,
    fontSize: fs(22),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.paper50,
  },
  hallCardNameClosed: { color: withOpacity(colors.paper50, 75) },
  hallChip: {
    position: "absolute",
    top: 10,
    right: 10,
    borderRadius: radii.pill,
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(2.5),
  },
  hallChipOpen: { backgroundColor: colors.gold500 },
  hallChipClosed: { backgroundColor: withOpacity(colors.paper50, 18) },
  hallChipText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, textTransform: "uppercase" },
  hallChipTextOpen: { color: colors.maroon900 },
  hallChipTextClosed: { color: colors.paper50 },

  // Translucent band over the same card gradient (own semi-transparent black background, not a
  // second gradient) with a hairline top divider, per the canvas's split-card strip.
  grabStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3.5),
    backgroundColor: withOpacity("#000000", 28),
    borderTopWidth: 1,
    borderTopColor: withOpacity(colors.paper50, 22),
  },
  grabStripClosed: { backgroundColor: withOpacity("#000000", 22), borderTopColor: withOpacity(colors.paper50, 15) },
  grabStripLeft: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  grabStripLabel: { fontFamily: fonts.display600, fontSize: fs(11), letterSpacing: 1.2, color: colors.paper50 },
  grabStripHours: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.paper50, 60) },
  grabStripChevron: { fontFamily: fonts.body400, fontSize: fs(14), color: withOpacity(colors.paper50, 70) },
  // Closed state: "all strip content" at one flat opacity, per the canvas -- overrides the
  // per-element open-state opacities above rather than stacking with them.
  grabStripTextClosed: { color: withOpacity(colors.paper50, 45) },

  section: { marginTop: spacing(5), gap: spacing(2.5) },

  retailList: { gap: spacing(2.5) },
  // Was a Card (bg/border/radius) wrapping non-interactive content; #177 makes the row itself the
  // Pressable, so those visual tokens moved here directly (Card isn't a Pressable, see its own
  // note — nesting Pressable inside a plain View works fine, but Link's asChild needs the row
  // itself to be the pressable element for touch/navigation to reach it).
  retailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing(2),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    minHeight: fs(44),
    backgroundColor: colors.paper50,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
  },
  retailInfo: { flexShrink: 1, gap: 1 },
  retailName: { flexShrink: 1, fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  retailStatus: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.3, textTransform: "uppercase" },
  retailStatusOpen: { color: colors.maroon600 },
  retailStatusClosed: { color: withOpacity(colors.ink900, 45) },
  retailChevron: { fontFamily: fonts.body400, fontSize: fs(18), color: withOpacity(colors.ink900, 35) },

  quickLinks: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  quickLink: {
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    backgroundColor: colors.paper50,
    borderRadius: radii.md,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
  },
  quickLinkText: { color: colors.maroon600, fontFamily: fonts.body600, fontSize: fs(13) },
});
