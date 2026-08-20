import { DINING_HALLS, fetchDiningHours, favoriteKey, openStatus, type DiningHoursFeed, type Favorite } from "@udine/shared";
import { LinearGradient } from "expo-linear-gradient";
import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, SectionHeader } from "../components/ui";
import { PaneHeader } from "../components/PaneHeader";
import { colors, fonts, fs, hallGradientClosed, hallGradients, radii, spacing, withOpacity } from "../lib/theme";
import { deriveHomeHero, formatHeroLine, formatLocationChip, retailOpenStatus, type HomeHero } from "../lib/homeHero";
import { HOME_PANE_INDEX, initialPaneOffset, paneIndexForScrollOffset, shouldLandOnHome } from "../lib/paneShell";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { isFirstRunDismissed } from "../lib/firstRun";
import { FriendsBody } from "./friends";
import { NotificationsBody } from "./notifications";
import { YouPane } from "../panes/YouPane";

const favoritesStorage = new SqliteFavoritesStorage();

// #90 canvas doesn't carry these (its Home artboard is hero + hall cards + cafés/markets), but
// dropping them would strand /filters, /favorites, /rank, /events, /press, /newsletter with no
// in-app entry point — #91-#93 re-home this list as they replace each pane's internals.
const QUICK_LINKS: { href: string; label: string }[] = [
  { href: "/filters", label: "Dietary filters" },
  { href: "/favorites", label: "Favorites" },
  { href: "/rank", label: "Rank dishes" },
  { href: "/events", label: "Events" },
  { href: "/press", label: "Press" },
  { href: "/newsletter", label: "Newsletter" },
];

function HeroBlock({ hero, now }: { hero: HomeHero; now: Date }) {
  const { title, subtitle } = formatHeroLine(hero);
  const dateLine = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <View style={styles.hero}>
      <Text style={styles.heroKicker}>{dateLine}</Text>
      <View style={styles.heroRow}>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.heroGoldBar} />
    </View>
  );
}

/** Full-width gradient hall card per the canvas: giant clipped monogram top-right, status pill,
 * condensed name bottom-left. Closed halls get the shared washed-out gradient + dimmed name. */
function HallCard({
  hall,
  chip,
  isFavorite,
  onToggleFavorite,
}: {
  hall: { slug: string; name: string; tid: number };
  chip: { open: boolean; text: string };
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const gradient = chip.open ? (hallGradients[hall.slug] ?? hallGradients.worcester) : hallGradientClosed;
  return (
    <View style={styles.hallCard}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }} style={StyleSheet.absoluteFill} />
      <Text style={[styles.hallMonogram, !chip.open && styles.hallMonogramClosed]}>{hall.name.charAt(0)}</Text>
      {/* Sibling absolute-fill Pressable (not a parent of the star below) so the two touch
          targets don't nest — nested Pressables in RN double-fire/steal gestures. */}
      <Link href={`/halls/${hall.slug}`} asChild>
        <Pressable style={StyleSheet.absoluteFill} />
      </Link>
      {chip.text ? (
        <View style={[styles.hallChip, chip.open ? styles.hallChipOpen : styles.hallChipClosed]} pointerEvents="none">
          <Text style={[styles.hallChipText, chip.open ? styles.hallChipTextOpen : styles.hallChipTextClosed]}>{chip.text}</Text>
        </View>
      ) : null}
      <Text style={[styles.hallCardName, !chip.open && styles.hallCardNameClosed]} pointerEvents="none">
        {hall.name}
      </Text>
      {/* Not on the artboard, but /favorites only lists — this star is the sole way to favorite a
          hall, so it stays (top-left; the canvas's top-right corner belongs to the status pill). */}
      <Pressable onPress={onToggleFavorite} hitSlop={8} style={styles.hallCardStar}>
        <Text style={[styles.star, isFavorite && styles.starActive]}>{isFavorite ? "★" : "☆"}</Text>
      </Pressable>
    </View>
  );
}

// Exported so it's independently testable (#104 review round) without pulling in SocialPane's/
// YouPane's own network- and storage-backed siblings, which the pager mounts eagerly alongside it.
export function HomePane({ activeIndex }: { activeIndex: number }) {
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoriteHallKeys, setFavoriteHallKeys] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());
  const insets = useSafeAreaInsets();

  const load = useCallback(() => {
    setNow(new Date());
    favoritesStorage.getFavorites().then((favs) => {
      setFavoriteHallKeys(new Set(favs.filter((f) => f.type === "location").map(favoriteKey)));
    });
    fetchDiningHours().then(setHoursFeed).catch((e) => setError(String(e)));
  }, []);

  useFocusEffect(load);

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

  return (
    <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + spacing(4.5) }]}>
      <PaneHeader title="UDine" activeIndex={activeIndex} />

      {error && <Text style={styles.error}>Couldn't load dining hours: {error}</Text>}
      {!hoursFeed && !error && <ActivityIndicator color={colors.maroon600} style={styles.loading} />}
      {hero && <HeroBlock hero={hero} now={now} />}

      <View style={styles.hallList}>
        {DINING_HALLS.map((hall) => {
          const hallHours = hoursFeed?.halls.find((h) => h.hallTid === hall.tid);
          const chip = hallHours ? formatLocationChip(openStatus(hallHours, now)) : { open: false, text: "" };
          const isFavorite = favoriteHallKeys.has(favoriteKey({ type: "location", hallTid: hall.tid }));
          return <HallCard key={hall.slug} hall={hall} chip={chip} isFavorite={isFavorite} onToggleFavorite={() => toggleHall(hall.tid)} />;
        })}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Cafés & Markets" />
        <View style={styles.retailList}>
          {(hoursFeed?.retail ?? []).map((loc) => {
            const chip = formatLocationChip(retailOpenStatus(loc, now));
            return (
              <Card key={loc.name} style={styles.retailRow}>
                <Text style={styles.retailName}>{loc.name}</Text>
                <Text style={[styles.retailStatus, chip.open ? styles.retailStatusOpen : styles.retailStatusClosed]}>{chip.text}</Text>
              </Card>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="More" />
        <View style={styles.quickLinks}>
          {QUICK_LINKS.map((link) => (
            <Link key={link.href} href={link.href as never} asChild>
              <Pressable style={styles.quickLink}>
                <Text style={styles.quickLinkText}>{link.label}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function SocialPane({ activeIndex }: { activeIndex: number }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + spacing(4.5) }]}>
      <PaneHeader title="Social" activeIndex={activeIndex} />
      <FriendsBody />
      <NotificationsBody />
    </ScrollView>
  );
}

/**
 * The 3-pane swipe shell (Social ← Home → You). RN core only — a horizontal, paging ScrollView
 * with each pane sized to the pager's own laid-out width/height (via onLayout on the ScrollView
 * itself, not useWindowDimensions — the window is taller than the pager's actual content area
 * once the Stack header is subtracted, and an unsized/overshot page height would let a pane's
 * `flex: 1` wrapper (see YouPane.tsx) collapse to zero — a flex child needs a parent with a
 * *resolved* height, which the window height alone doesn't give it here). Lands on Home by
 * scrolling once from onContentSizeChange, only after the native content has reached its full
 * 3-pane width — scrolling from the same commit that sizes the panes races the native contentSize
 * update and clamps to x=0, stranding the user on Social (contentOffset alone is also unreliable
 * on Android).
 */
export default function PaneShellScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  const [activeIndex, setActiveIndex] = useState(HOME_PANE_INDEX);
  const landedOnHome = useRef(false);

  // First launch → the full-screen login/value-prop screen (#96, replaces #68's FirstRunCard).
  // Pushed (not replaced) so both of its exits just pop back to the shell.
  useEffect(() => {
    isFirstRunDismissed().then((dismissed) => {
      if (!dismissed) router.push("/login");
    });
  }, []);

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setPaneSize({ width, height });
  }

  function handleContentSizeChange(contentWidth: number) {
    if (!shouldLandOnHome(contentWidth, paneSize.width, landedOnHome.current)) return;
    landedOnHome.current = true;
    // One frame later, not synchronously: with the Stack header gone (v2 canvas headers) this
    // callback again races the native scrollable-range update, and a same-frame scrollTo clamps
    // to x=0, stranding the shell on Social (the exact failure #104's comment describes).
    const x = initialPaneOffset(paneSize.width);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ x, animated: false }));
  }

  function handleScrollSettle(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setActiveIndex(paneIndexForScrollOffset(e.nativeEvent.contentOffset.x, paneSize.width));
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onLayout={handleLayout}
      onContentSizeChange={handleContentSizeChange}
      onMomentumScrollEnd={handleScrollSettle}
      onScrollEndDrag={handleScrollSettle}
      style={styles.pager}
    >
      <View style={paneSize}>
        <SocialPane activeIndex={activeIndex} />
      </View>
      <View style={paneSize}>
        <HomePane activeIndex={activeIndex} />
      </View>
      <View style={paneSize}>
        <YouPane activeIndex={activeIndex} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pager: { flex: 1, backgroundColor: colors.cream100 },
  paneScroll: { flex: 1, backgroundColor: colors.cream100 },
  paneContainer: { paddingHorizontal: spacing(5), paddingBottom: spacing(10) },

  error: { color: "#b00020", fontFamily: fonts.body400, marginVertical: spacing(3) },
  loading: { marginVertical: spacing(3) },

  hero: { paddingTop: spacing(1), paddingBottom: spacing(3.5) },
  heroKicker: {
    fontFamily: fonts.body600,
    fontSize: fs(12),
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: withOpacity(colors.ink900, 55),
    marginBottom: spacing(0.5),
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
  hallCard: { height: 106, borderRadius: radii.md, overflow: "hidden", justifyContent: "flex-end" },
  hallMonogram: {
    position: "absolute",
    right: -8,
    top: -22,
    fontFamily: fonts.display700,
    fontSize: fs(120),
    lineHeight: fs(120),
    color: withOpacity(colors.paper50, 8),
  },
  hallMonogramClosed: { color: withOpacity(colors.paper50, 6) },
  hallCardName: {
    paddingHorizontal: spacing(3.5),
    paddingBottom: spacing(3),
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
  hallCardStar: { position: "absolute", top: spacing(1), left: spacing(1.5), padding: spacing(1) },
  star: { fontSize: fs(18), color: withOpacity(colors.paper50, 45) },
  starActive: { color: colors.gold500 },

  section: { marginTop: spacing(5), gap: spacing(2.5) },

  retailList: { gap: spacing(2.5) },
  retailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing(2),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    minHeight: 44,
  },
  retailName: { flexShrink: 1, fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  retailStatus: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.3, textTransform: "uppercase" },
  retailStatusOpen: { color: colors.maroon600 },
  retailStatusClosed: { color: withOpacity(colors.ink900, 45) },

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
