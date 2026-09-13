import { DINING_HALLS, favoriteKey, htmlToText, openStatus, type DiningHoursFeed, type Favorite } from "@udine/shared";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfflineLine } from "../components/OfflineLine";
import { SkeletonBar } from "../components/Skeleton";
import { SectionHeader } from "../components/ui";
import { PaneStack } from "../components/PaneStack";
import { PressDim } from "../components/Press";
import { colors, fonts, fs, hallGradientClosed, hallGradients, radii, spacing, withOpacity } from "../lib/theme";
import { isRealAddressLine } from "../lib/address";
import { deriveHomeHero, formatHeroLine, formatLocationChip, offlineUpdatedLine, retailOpenStatus, type HomeHero } from "../lib/homeHero";
import { excludeGrabNGoLocations, grabRouteFor, grabStripState } from "../lib/grabStrip";
import { getCachedHours, fetchHoursAndCache } from "../lib/menuHoursCache";
import { HOME_PANE_INDEX } from "../lib/paneShell";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { EventsPane } from "../panes/EventsPane";
import { YouPane } from "../panes/YouPane";

const favoritesStorage = new SqliteFavoritesStorage();

// address is raw HTML (possibly multi-line); take the first line with real content
// (isRealAddressLine) so a degenerate blob (e.g. a lone ",") doesn't render as the subtitle.
function retailSubtitle(address: string | undefined): string | null {
  return htmlToText(address).split("\n").find(isRealAddressLine)?.trim() ?? null;
}

// docs/design/HomeLoading.dc.html:113-135 -- 3 placeholder rows, sized to match the real spread of
// name/subtitle lengths rather than one repeated width.
const RETAIL_SKELETON_ROWS = [
  { title: 96, subtitle: 132 },
  { title: 118, subtitle: 104 },
  { title: 148, subtitle: 90 },
];

// hero is null both while the first fetch is pending (show skeleton) and on a dead-end fetch
// failure with no cache (`error` is set instead) -- `pending` distinguishes the two so the
// skeleton doesn't shimmer forever under the error text. The date line needs no network, so it
// always renders regardless.
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
          <>
            {/* docs/design/HomeLoading.dc.html:34-35 -- title bar + subtitle bar side by side,
                gap 12/baseline already supplied by heroRow (matches the real-content branch above). */}
            <SkeletonBar width={fs(148)} height={fs(42)} />
            <SkeletonBar width={fs(128)} height={fs(13)} />
          </>
        ) : null}
      </View>
      <View style={styles.heroGoldBar} />
    </View>
  );
}

// Fixed px, not run through fs()/spacing() -- touch targets don't scale. `top` extends into the
// hall zone above since RN resolves overlapping Pressables by child order and this strip is later
// in the column -- on-device measurement (Narrow AVD, #461) showed this reaching ~65px/~22dp above
// the strip's own visible top edge at the old top:16, eating nearly a third of the 70dp hall zone
// at the hall zone's expense (owner report). Lowered to keep the combined strip touch target
// (visible content + padding + this hitSlop) at the ~44-48dp minimum without swallowing most of
// the hall zone above it. `bottom` must stay under the smallest hallList gap (spacing(2.5), ~8dp
// at 320dp) or it bleeds into the next card's zone below.
const GRAB_STRIP_HIT_SLOP = { top: 6, bottom: 4, left: 8, right: 8 };

// Hall card: one rounded unit, two tap zones -- hall area opens the hall menu, translucent
// Grab 'N Go strip along the bottom opens that hall's Grab 'N Go menu. Closed halls get a dimmed
// gradient/name and a further-dimmed strip.
function HallCard({
  hall,
  chip,
  grab,
  pending,
}: {
  hall: { slug: string; name: string; tid: number };
  chip: { open: boolean; text: string };
  grab: { open: boolean; text: string };
  /** Hall name/monogram are always known (DINING_HALLS is static); only the open/closed chip
   * needs hoursFeed, so only it shimmers while `pending`. */
  pending: boolean;
}) {
  const gradient = chip.open ? (hallGradients[hall.slug] ?? hallGradients.worcester) : hallGradientClosed;
  return (
    <View style={styles.hallCard}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }} style={StyleSheet.absoluteFill} />

      <View style={styles.hallZone}>
        {/* Pressable wraps monogram/chip/name instead of sitting beside them: Android's
            ReactTextView ignores pointerEvents="none" (RN's TouchTargetHelper.kt), so touches on
            the Text children bubble to their nearest Pressable ancestor, not a sibling. `style`
            stays one object, not an array, because <Slot> (asChild) can't take an array style on
            its direct child. */}
        <Link href={`/halls/${hall.slug}`} asChild>
          <PressDim style={styles.hallZoneTap} accessibilityRole="button">
            <Text style={[styles.hallMonogram, !chip.open && styles.hallMonogramClosed]}>{hall.name.charAt(0)}</Text>
            {pending ? (
              // docs/design/HomeLoading.dc.html:44 -- one continuously-shimmering 132x20 pill, not
              // a static hallChip wrapping a smaller shimmer sliver.
              <SkeletonBar width={fs(132)} height={fs(20)} style={styles.hallChipPending} />
            ) : chip.text ? (
              <View style={[styles.hallChip, chip.open ? styles.hallChipOpen : styles.hallChipClosed]}>
                <Text style={[styles.hallChipText, chip.open ? styles.hallChipTextOpen : styles.hallChipTextClosed]}>{chip.text}</Text>
              </View>
            ) : null}
            <Text style={[styles.hallCardName, !chip.open && styles.hallCardNameClosed]}>{hall.name}</Text>
          </PressDim>
        </Link>
      </View>

      {/* <Slot> (what asChild renders) clones its direct child and can't handle an array `style`
          prop there -- needs one flattened object, unlike a plain Pressable. PressDim forwards
          `style` straight to its own inner Pressable, so it's a drop-in here. */}
      <Link href={grabRouteFor(hall.slug) as never} asChild>
        <PressDim hitSlop={GRAB_STRIP_HIT_SLOP} style={StyleSheet.flatten([styles.grabStrip, !grab.open && styles.grabStripClosed])} accessibilityRole="button">
          <View style={styles.grabStripLeft}>
            <Text style={[styles.grabStripLabel, !grab.open && styles.grabStripTextClosed]}>GRAB &apos;N GO</Text>
            {pending ? (
              // docs/design/HomeLoading.dc.html:51 -- 68x11 skeleton bar for the strip's hours text.
              <SkeletonBar width={fs(68)} height={fs(11)} />
            ) : grab.text ? (
              <Text style={[styles.grabStripHours, !grab.open && styles.grabStripTextClosed]}>{grab.text}</Text>
            ) : null}
          </View>
          <Text style={[styles.grabStripChevron, !grab.open && styles.grabStripTextClosed]}>›</Text>
        </PressDim>
      </Link>
    </View>
  );
}

// Exported so it's testable independently of EventsPane/YouPane, which the pager mounts eagerly
// alongside it.
export function HomePane() {
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  // offline is not an error state -- offline + cachedAt drive the wifi-off line; error is
  // reserved for a fetch failure with no cache to fall back to.
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [favoriteHallKeys, setFavoriteHallKeys] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());
  const insets = useSafeAreaInsets();

  // `current` guards against a stale response winning a race: refocusing this screen while an
  // earlier fetch is still in flight can otherwise let it resolve after a newer one and overwrite
  // a fresh feed with a stale cached copy.
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
        // "offline" means "last fetch failed" -- a proxy for connectivity (no netinfo dependency
        // here); a real network error and a server outage both get the same treatment.
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

  // Single registration: `load`'s own cleanup provides the "current" guard, so there's no need
  // for a second separate useFocusEffect call.
  useFocusEffect(load);

  // No UI calls this yet; kept because dish ranking derives favorite halls into this same storage.
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
  // Hall names/monograms render unconditionally from DINING_HALLS (known without network); only
  // each hall's open/closed chip needs hoursFeed, so only it shimmers while pending.
  const pending = !hoursFeed && !error;

  return (
    <>
      <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + fs(52) + spacing(2.5) }]}>
      {/* error only reaches here on a genuine dead end -- anything with a cache falls back to
          `offline` (see HeroBlock) instead. */}
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
          {/* Every row navigates to /cafe/[name] -- that's always the same unified menu screen
              (integrated/standing/info-only, see HallMenuScreenBody in halls/[slug].tsx). */}
          {pending
            ? RETAIL_SKELETON_ROWS.map((row, i) => (
                <View key={i} style={styles.retailRow}>
                  <View style={styles.retailInfo}>
                    <SkeletonBar width={fs(row.title)} height={fs(13)} />
                    <SkeletonBar width={fs(row.subtitle)} height={fs(11)} />
                  </View>
                  <SkeletonBar width={fs(84)} height={fs(11)} />
                </View>
              ))
            : excludeGrabNGoLocations(hoursFeed?.retail ?? [], DINING_HALLS).map((loc) => {
                const chip = formatLocationChip(retailOpenStatus(loc, now));
                return (
                  <Link key={loc.name} href={`/cafe/${encodeURIComponent(loc.name)}`} asChild>
                    <Pressable style={styles.retailRow} accessibilityRole="button">
                      <View style={styles.retailInfo}>
                        <Text style={styles.retailName}>{loc.name}</Text>
                        {/* docs/design/HomeOffline.dc.html:117-119, Main.dc.html:111-113 -- location
                            subtitle (building/area), e.g. "Campus Center". */}
                        {retailSubtitle(loc.address) ? <Text style={styles.retailSubtitle}>{retailSubtitle(loc.address)}</Text> : null}
                        <Text style={[styles.retailStatus, chip.open ? styles.retailStatusOpen : styles.retailStatusClosed]}>{chip.text}</Text>
                      </View>
                      <Text style={styles.retailChevron}>›</Text>
                    </Pressable>
                  </Link>
                );
              })}
        </View>
      </View>

      </ScrollView>
    </>
  );
}

// The 3-pane shell (Events <- Home -> You). Panes are stacked via PaneStack's shared-axis
// transition, not a translating strip, so landing on Home is just PaneStack's Animated.Values
// starting at HOME_PANE_INDEX.
export default function PaneShellScreen() {
  const [activeIndex, setActiveIndex] = useState(HOME_PANE_INDEX);
  const insets = useSafeAreaInsets();

  // MVP cut (temporary, see archive/full-features): first-launch push to /login is shelved along
  // with login.tsx/redirect.tsx and the rest of account -- nothing here needs a session.

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
  // hallZone (fixed height) + grabStrip (intrinsic height) stacked in a column -- no fixed height
  // on the outer card.
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
  hallChipPending: { position: "absolute", top: 10, right: 10, borderRadius: radii.pill },
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
  // Row itself is the Pressable (Card isn't a Pressable); Link's asChild needs the row itself to
  // be the pressable element for touch/navigation to reach it.
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
  retailSubtitle: { flexShrink: 1, fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  retailStatus: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.3, textTransform: "uppercase" },
  retailStatusOpen: { color: colors.maroon600 },
  retailStatusClosed: { color: withOpacity(colors.ink900, 45) },
  retailChevron: { fontFamily: fonts.body400, fontSize: fs(18), color: withOpacity(colors.ink900, 35) },
});
