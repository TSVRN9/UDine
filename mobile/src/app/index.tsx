import { DINING_HALLS, fetchDiningHours, favoriteKey, openStatus, type DiningHoursFeed, type Favorite } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Card } from "../components/ui";
import { colors, fonts, radii, spacing, withOpacity } from "../lib/theme";
import { deriveHomeHero, formatHeroLine, formatLocationChip, retailOpenStatus, type HomeHero } from "../lib/homeHero";
import { HOME_PANE_INDEX, initialPaneOffset, paneDots, paneIndexForScrollOffset } from "../lib/paneShell";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { signInWithGoogle, signOut } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { FriendsBody } from "./friends";
import { NotificationsBody } from "./notifications";
import TodayScreen from "./today";

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

// Cosmetic-only accent alternation for the hall-card "gradient" placeholder — no meaning beyond
// visual variety across the 4 cards.
const HALL_ACCENTS = [colors.gold500, colors.maroon600, colors.gold500, colors.maroon600];

/** Pane header: title + position dots, per #90 ("position dots in each pane's header"). */
function PaneHeader({ title, activeIndex }: { title: string; activeIndex: number }) {
  return (
    <View>
      <View style={styles.paneHeaderRow}>
        <Text style={styles.pageTitle}>{title}</Text>
        <View style={styles.dotsRow}>
          {paneDots(activeIndex).map((active, i) => (
            <View key={i} style={[styles.dot, active && styles.dotActive]} />
          ))}
        </View>
      </View>
      <View style={styles.rule} />
    </View>
  );
}

/** `tone` picks the CLOSED-chip palette for the surface it sits on: "light" for the paper/cream
 * café & market rows, "dark" for the hall cards' maroon scrim. The OPEN (gold) chip has enough
 * contrast on either, so only the CLOSED variant needs to branch. */
function StatusChip({ chip, tone = "light" }: { chip: { open: boolean; text: string }; tone?: "light" | "dark" }) {
  if (!chip.text) return null;
  return (
    <View style={[styles.chip, chip.open ? styles.chipOpen : tone === "dark" ? styles.chipClosedDark : styles.chipClosedLight]}>
      <Text style={[styles.chipText, chip.open ? styles.chipTextOpen : tone === "dark" ? styles.chipTextClosedDark : styles.chipTextClosedLight]}>
        {chip.text}
      </Text>
    </View>
  );
}

function HeroCard({ hero }: { hero: HomeHero }) {
  const { title, subtitle } = formatHeroLine(hero);
  return (
    <View style={styles.hero}>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
    </View>
  );
}

function HallCard({
  hall,
  index,
  chip,
  isFavorite,
  onToggleFavorite,
}: {
  hall: { slug: string; name: string; tid: number };
  index: number;
  chip: { open: boolean; text: string };
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const accent = HALL_ACCENTS[index % HALL_ACCENTS.length];
  return (
    <View style={styles.hallCard}>
      <View style={styles.hallCardBg} />
      <View style={[styles.hallCardGlow, { backgroundColor: withOpacity(accent, 35) }]} />
      <Text style={styles.hallMonogram}>{hall.name.charAt(0)}</Text>
      <View style={styles.hallCardScrim} />
      {/* Sibling absolute-fill Pressable (not a parent of the star below) so the two touch
          targets don't nest — nested Pressables in RN double-fire/steal gestures. */}
      <Link href={`/halls/${hall.slug}`} asChild>
        <Pressable style={StyleSheet.absoluteFill} />
      </Link>
      <View style={styles.hallCardFooter} pointerEvents="none">
        <Text style={styles.hallCardName}>{hall.name}</Text>
        <StatusChip chip={chip} tone="dark" />
      </View>
      <Pressable onPress={onToggleFavorite} hitSlop={8} style={styles.hallCardStar}>
        <Text style={[styles.star, isFavorite && styles.starActive]}>{isFavorite ? "★" : "☆"}</Text>
      </Pressable>
    </View>
  );
}

function HomePane({ activeIndex }: { activeIndex: number }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoriteHallKeys, setFavoriteHallKeys] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

  const load = useCallback(() => {
    setNow(new Date());
    favoritesStorage.getFavorites().then((favs) => {
      setFavoriteHallKeys(new Set(favs.filter((f) => f.type === "location").map(favoriteKey)));
    });
    fetchDiningHours().then(setHoursFeed).catch((e) => setError(String(e)));
  }, []);

  useFocusEffect(load);

  async function handleSignIn() {
    try {
      await signInWithGoogle();
    } catch (err) {
      Alert.alert("Sign-in failed", err instanceof Error ? err.message : String(err));
    }
  }

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
    <ScrollView style={styles.paneScroll} contentContainerStyle={styles.paneContainer}>
      <PaneHeader title="Home" activeIndex={activeIndex} />

      <View style={styles.authRow}>
        {session ? (
          <>
            <Text style={styles.authText}>Signed in as {session.user.email}</Text>
            <Pressable onPress={() => signOut()}>
              <Text style={styles.authLink}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={handleSignIn}>
            <Text style={styles.authLink}>Sign in with Google</Text>
          </Pressable>
        )}
      </View>

      {error && <Text style={styles.error}>Couldn't load dining hours: {error}</Text>}
      {!hoursFeed && !error && <ActivityIndicator color={colors.maroon600} style={styles.loading} />}
      {hero && <HeroCard hero={hero} />}

      <Text style={styles.sectionTitle}>Dining halls</Text>
      <View style={styles.thinRule} />
      <View style={styles.hallGrid}>
        {DINING_HALLS.map((hall, i) => {
          const hallHours = hoursFeed?.halls.find((h) => h.hallTid === hall.tid);
          const chip = hallHours ? formatLocationChip(openStatus(hallHours, now)) : { open: false, text: "" };
          const isFavorite = favoriteHallKeys.has(favoriteKey({ type: "location", hallTid: hall.tid }));
          return <HallCard key={hall.slug} hall={hall} index={i} chip={chip} isFavorite={isFavorite} onToggleFavorite={() => toggleHall(hall.tid)} />;
        })}
      </View>

      <Text style={styles.sectionTitle}>Cafés &amp; Markets</Text>
      <View style={styles.thinRule} />
      <View style={styles.retailList}>
        {(hoursFeed?.retail ?? []).map((loc) => (
          <Card key={loc.name} style={styles.retailRow}>
            <Text style={styles.retailName}>{loc.name}</Text>
            <StatusChip chip={formatLocationChip(retailOpenStatus(loc, now))} />
          </Card>
        ))}
      </View>

      <Text style={styles.sectionTitle}>More</Text>
      <View style={styles.thinRule} />
      <View style={styles.quickLinks}>
        {QUICK_LINKS.map((link) => (
          <Link key={link.href} href={link.href as never} asChild>
            <Pressable style={styles.quickLink}>
              <Text style={styles.quickLinkText}>{link.label}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

function SocialPane({ activeIndex }: { activeIndex: number }) {
  return (
    <ScrollView style={styles.paneScroll} contentContainerStyle={styles.paneContainer}>
      <PaneHeader title="Social" activeIndex={activeIndex} />
      <FriendsBody />
      <NotificationsBody />
    </ScrollView>
  );
}

function YouPane({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.paneFlex}>
      <PaneHeader title="You" activeIndex={activeIndex} />
      <View style={styles.paneFlex}>
        <TodayScreen />
      </View>
    </View>
  );
}

/**
 * The 3-pane swipe shell (Social ← Home → You). RN core only — a horizontal, paging ScrollView
 * with each pane sized to the pager's own laid-out width/height (via onLayout on the ScrollView
 * itself, not useWindowDimensions — the window is taller than the pager's actual content area
 * once the Stack header is subtracted, and an unsized/overshot page height would let YouPane's
 * `flex: 1` wrapper around TodayScreen collapse to zero — a flex child needs a parent with a
 * *resolved* height, which the window height alone doesn't give it here). Lands on Home by
 * scrolling there once after the first layout via a ref (contentOffset alone is unreliable on
 * Android).
 */
export default function PaneShellScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  const [activeIndex, setActiveIndex] = useState(HOME_PANE_INDEX);
  const landedOnHome = useRef(false);

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setPaneSize({ width, height });
  }

  useEffect(() => {
    if (landedOnHome.current || paneSize.width <= 0) return;
    landedOnHome.current = true;
    scrollRef.current?.scrollTo({ x: initialPaneOffset(paneSize.width), animated: false });
  }, [paneSize.width]);

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
  paneFlex: { flex: 1, backgroundColor: colors.cream100 },
  paneScroll: { flex: 1, backgroundColor: colors.cream100 },
  paneContainer: { padding: spacing(4), paddingBottom: spacing(10) },

  paneHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  dotsRow: { flexDirection: "row", gap: spacing(1) },
  dot: { width: 6, height: 6, borderRadius: radii.pill, backgroundColor: withOpacity(colors.maroon900, 25) },
  dotActive: { backgroundColor: colors.maroon900 },
  rule: { marginTop: spacing(2), marginBottom: spacing(3), height: 0, borderTopWidth: 4, borderBottomWidth: 1, borderColor: colors.gold500 },

  authRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing(4) },
  authText: { color: withOpacity(colors.ink900, 60), fontFamily: fonts.body, fontSize: 13 },
  authLink: { color: colors.maroon600, fontFamily: fonts.body, fontWeight: "600", fontSize: 13 },

  error: { color: "#b00020", fontFamily: fonts.body, marginBottom: spacing(3) },
  loading: { marginBottom: spacing(3) },

  hero: {
    backgroundColor: colors.maroon900,
    borderRadius: radii.md,
    paddingVertical: spacing(6),
    paddingHorizontal: spacing(4),
    alignItems: "center",
    marginBottom: spacing(2),
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.paper50,
  },
  heroSubtitle: {
    marginTop: spacing(1),
    fontFamily: fonts.body,
    fontSize: 14,
    color: withOpacity(colors.paper50, 80),
  },

  sectionTitle: {
    marginTop: spacing(6),
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  thinRule: { marginTop: spacing(1), marginBottom: spacing(3), height: 1, backgroundColor: withOpacity(colors.ink900, 25) },

  hallGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3) },
  hallCard: {
    width: "47%",
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: colors.maroon900,
  },
  hallCardBg: { ...StyleSheet.absoluteFill, backgroundColor: colors.maroon900 },
  hallCardGlow: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 90,
    height: 90,
    borderRadius: radii.pill,
  },
  hallMonogram: {
    position: "absolute",
    top: "30%",
    alignSelf: "center",
    fontFamily: fonts.display,
    fontSize: 44,
    fontWeight: "700",
    color: withOpacity(colors.paper50, 55),
  },
  hallCardScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "45%",
    backgroundColor: withOpacity(colors.ink900, 55),
  },
  hallCardFooter: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing(2.5), gap: spacing(1) },
  hallCardName: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.paper50,
  },
  hallCardStar: { position: "absolute", top: spacing(1.5), right: spacing(1.5), padding: spacing(1) },
  star: { fontSize: 20, color: withOpacity(colors.paper50, 55) },
  starActive: { color: colors.gold500 },

  chip: { alignSelf: "flex-start", borderRadius: radii.sm, paddingVertical: 2, paddingHorizontal: spacing(1.5) },
  chipOpen: { backgroundColor: colors.gold500 },
  chipClosedDark: { backgroundColor: withOpacity(colors.paper50, 22) },
  chipClosedLight: { backgroundColor: withOpacity(colors.ink900, 10) },
  chipText: { fontFamily: fonts.body, fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  chipTextOpen: { color: colors.maroon900 },
  chipTextClosedDark: { color: withOpacity(colors.paper50, 90) },
  chipTextClosedLight: { color: withOpacity(colors.ink900, 60) },

  retailList: { gap: spacing(2) },
  retailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing(3) },
  retailName: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.ink900 },

  quickLinks: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  quickLink: {
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: 2,
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(3),
  },
  quickLinkText: { color: colors.maroon600, fontFamily: fonts.body, fontWeight: "600", fontSize: 13 },
});
