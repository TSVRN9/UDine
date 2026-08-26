import { DINING_HALLS, favoriteKey, openStatus, type DiningHoursFeed, type Favorite } from "@udine/shared";
import { LinearGradient } from "expo-linear-gradient";
import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfflineLine } from "../components/OfflineLine";
import { SkeletonBar } from "../components/Skeleton";
import { SectionHeader } from "../components/ui";
import { PaneStack } from "../components/PaneStack";
import { usePressDimOverlay, PressDim } from "../components/Press";
import { colors, fonts, fs, hallGradientClosed, hallGradients, radii, spacing, withOpacity } from "../lib/theme";
import { deriveHomeHero, formatHeroLine, formatLocationChip, offlineUpdatedLine, retailOpenStatus, type HomeHero } from "../lib/homeHero";
import { grabRouteFor, grabStripState } from "../lib/grabStrip";
import { getCachedHours, fetchHoursAndCache } from "../lib/menuHoursCache";
import { HOME_PANE_INDEX } from "../lib/paneShell";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { isFirstRunDismissed } from "../lib/firstRun";
import { supabase } from "../lib/supabase";
import { SocialPane } from "../panes/SocialPane";
import { YouPane } from "../panes/YouPane";

const favoritesStorage = new SqliteFavoritesStorage();

// #90 canvas doesn't carry these (its Home artboard is hero + hall cards + cafés/markets), but
// dropping them would strand /filters, /favorites, /rank, /events, /press, /newsletter with no
// in-app entry point — #91-#93 re-home this list as they replace each pane's internals. #93's
// SocialPane doesn't mount NotificationsBody (the Social artboard has no notifications toggle/
// sightings feed) -- /notifications is added here so that feature (and the cron job/Edge Function
// behind it) stays reachable from the UI.
const QUICK_LINKS: { href: string; label: string }[] = [
  { href: "/filters", label: "Dietary filters" },
  { href: "/favorites", label: "Favorites" },
  { href: "/rank", label: "Rank dishes" },
  { href: "/events", label: "Events" },
  { href: "/press", label: "Press" },
  { href: "/newsletter", label: "Newsletter" },
  { href: "/notifications", label: "Notifications" },
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
  isFavorite,
  onToggleFavorite,
  grab,
  pending,
}: {
  hall: { slug: string; name: string; tid: number };
  chip: { open: boolean; text: string };
  isFavorite: boolean;
  onToggleFavorite: () => void;
  grab: { open: boolean; text: string };
  /** #181: hall NAME/monogram below are always known (DINING_HALLS is static); only the
   * open/closed chip needs hoursFeed, so only it shimmers while `pending`. */
  pending: boolean;
}) {
  const gradient = chip.open ? (hallGradients[hall.slug] ?? hallGradients.worcester) : hallGradientClosed;
  // `.pressd` (#179 press-feedback map: hall-card header zones). The tap target is a sibling
  // absolute-fill Pressable, not a parent of the monogram/chip/name it should dim (see that
  // Pressable's own comment on why) -- so the wrap-children shape PressDim uses elsewhere doesn't
  // fit here; usePressDimOverlay hands back the same brightness-equivalent overlay for this
  // disjoint-sibling case instead.
  const hallDim = usePressDimOverlay();
  return (
    <View style={styles.hallCard}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }} style={StyleSheet.absoluteFill} />

      <View style={styles.hallZone}>
        {/* pointerEvents="none": purely decorative, same as the chip/name below -- it shouldn't
            be able to absorb taps meant for the Link underneath it. */}
        <Text style={[styles.hallMonogram, !chip.open && styles.hallMonogramClosed]} pointerEvents="none">
          {hall.name.charAt(0)}
        </Text>
        {/* Sibling absolute-fill Pressable (not a parent of the star below) so the two touch
            targets don't nest — nested Pressables in RN double-fire/steal gestures.
            `collapsable={false}`: a childless absolute-fill Pressable is Android's classic
            view-flattening trap -- correct measured bounds, `clickable=true` in the view
            hierarchy, but zero touches delivered (found live on-device, #179 review; this exact
            Link+asChild+childless-Pressable shape has existed unchanged since #96/#104). Tried as
            the first, most-likely fix (matches this repo's own `hallCardSide` precedent for the
            identical symptom) -- kept because it's harmless and correct Android practice for this
            shape, but device-retested on Agent_Emulator_Wide (fresh JS, app fully relaunched, not
            just Fast Refreshed) and it did NOT restore navigation: tapping this zone still does
            nothing. So view-flattening was a reasonable hypothesis, not the (or not the whole)
            root cause -- this defect is CONFIRMED STILL OPEN, not fixed by this PR. See the PR
            body; recommend a follow-up issue with deeper native-side investigation (e.g.
            renderToHardwareTextureAndroid, or restructuring away from the sibling-Pressable shape
            entirely) rather than more guesses here. */}
        <Link href={`/halls/${hall.slug}`} asChild>
          <Pressable collapsable={false} style={StyleSheet.absoluteFill} onPressIn={hallDim.onPressIn} onPressOut={hallDim.onPressOut} />
        </Link>
        {pending ? (
          <View style={[styles.hallChip, styles.hallChipClosed]} pointerEvents="none">
            <SkeletonBar width={fs(46)} height={fs(11)} />
          </View>
        ) : chip.text ? (
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
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, hallDim.overlayStyle]} />
      </View>

      {/* expo-router's <Slot> (what asChild renders) clones its direct child and can't handle an
          array `style` prop there -- it needs one flattened object, unlike a plain RN Pressable
          (confirmed on-device: "[expo-router]: You are passing an array of styles to a child of
          <Slot>"). Only the pressable itself is that direct child; its own children are unaffected.
          PressDim forwards `style` straight to its own inner Pressable, so it's a drop-in here. */}
      <Link href={grabRouteFor(hall.slug) as never} asChild>
        <PressDim hitSlop={GRAB_STRIP_HIT_SLOP} style={StyleSheet.flatten([styles.grabStrip, !grab.open && styles.grabStripClosed])}>
          <View style={styles.grabStripLeft}>
            <Text style={[styles.grabStripLabel, !grab.open && styles.grabStripTextClosed]}>GRAB 'N GO</Text>
            {grab.text ? <Text style={[styles.grabStripHours, !grab.open && styles.grabStripTextClosed]}>{grab.text}</Text> : null}
          </View>
          <Text style={[styles.grabStripChevron, !grab.open && styles.grabStripTextClosed]}>›</Text>
        </PressDim>
      </Link>
    </View>
  );
}

// Exported so it's independently testable (#104 review round) without pulling in SocialPane's/
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

  const load = useCallback(() => {
    setNow(new Date());
    favoritesStorage.getFavorites().then((favs) => {
      setFavoriteHallKeys(new Set(favs.filter((f) => f.type === "location").map(favoriteKey)));
    });
    fetchHoursAndCache()
      .then((feed) => {
        setHoursFeed(feed);
        setOffline(false);
        setError(null);
      })
      .catch((e) => {
        // "offline" here really means "the last fetch failed" -- a rejected fetch as the
        // reachability signal, not a true OS-level connectivity check (no netinfo dependency in
        // this codebase). Good enough proxy: a real network error and a genuine server outage both
        // land here, and both get the same "render from what we've got" treatment.
        getCachedHours()
          .then((cached) => {
            if (cached) {
              setHoursFeed(cached.feed);
              setOffline(true);
              setCachedAt(cached.fetchedAt);
              setError(null);
            } else {
              setError(String(e));
            }
          })
          .catch(() => setError(String(e)));
      });
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
  // #181: honest skeleton -- the 4 hall names + monograms below render unconditionally from
  // DINING_HALLS regardless of `pending` (known without the network); only each hall's OPEN/CLOSED
  // chip (needs hoursFeed) shimmers while pending.
  const pending = !hoursFeed && !error;

  return (
    <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + fs(52) }]}>
      {/* error only reaches here on the genuine dead end -- fetch failed AND no cache exists.
          Anything with a cache falls back to `offline` (see HeroBlock) instead, per #181's owner
          decision that offline is not an error state. */}
      {error && <Text style={styles.error}>Couldn't load dining hours: {error}</Text>}
      <HeroBlock hero={hero} now={now} offline={offline} cachedAt={cachedAt} pending={pending} />

      <View style={styles.hallList}>
        {DINING_HALLS.map((hall) => {
          const hallHours = hoursFeed?.halls.find((h) => h.hallTid === hall.tid);
          const chip = hallHours ? formatLocationChip(openStatus(hallHours, now)) : { open: false, text: "" };
          const isFavorite = favoriteHallKeys.has(favoriteKey({ type: "location", hallTid: hall.tid }));
          const grab = grabStripState(hoursFeed?.retail ?? [], hall.name, now);
          return (
            <HallCard
              key={hall.slug}
              hall={hall}
              chip={chip}
              isFavorite={isFavorite}
              onToggleFavorite={() => toggleHall(hall.tid)}
              grab={grab}
              pending={pending}
            />
          );
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
            return (
              <Link key={loc.name} href={`/cafe/${encodeURIComponent(loc.name)}`} asChild>
                <Pressable style={styles.retailRow}>
                  <View style={styles.retailInfo}>
                    <Text style={styles.retailName}>{loc.name}</Text>
                    <Text style={[styles.retailStatus, chip.open ? styles.retailStatusOpen : styles.retailStatusClosed]}>{chip.text}</Text>
                  </View>
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

/**
 * The 3-pane shell (Social ← Home → You). #179 replaced the horizontal-ScrollView pager with the
 * artboard's shared-axis transition (see PaneStack) — panes are stacked, not a translating strip,
 * so there's no scroll offset/contentSize race to land on Home any more (the #f5f0d5b bug this
 * used to guard against). Landing on Home is now just PaneStack's own Animated.Values starting AT
 * HOME_PANE_INDEX (see its doc comment).
 */
export default function PaneShellScreen() {
  const [activeIndex, setActiveIndex] = useState(HOME_PANE_INDEX);
  const insets = useSafeAreaInsets();

  // First launch → the full-screen login/value-prop screen (#96, replaces #68's FirstRunCard).
  // Pushed (not replaced) so both of its exits just pop back to the shell.
  //
  // #278: also gated on a live session, not just the first-run flag. The #54 cold-start OAuth path
  // (app process killed mid Custom-Tab) lands here via redirect.tsx's <Redirect href="/" /> with the
  // first-run flag still undismissed -- dismissFirstRun() only ever runs inside login.tsx's done(),
  // which that path never reaches (signInWithGoogle() itself never resolves on a cold start; see
  // auth.ts). This does NOT suppress the single push on the cold-start landing itself: at that
  // instant no session has ever been persisted yet (first sign-in, detectSessionInUrl: false) and
  // redirect.tsx's exchangeCode is still in flight (not awaited before its <Redirect> renders), so
  // getSession() here is still null too -- this check and redirect.tsx's exchange are racing the
  // same instant, and getSession() loses it exactly as the #54 issue reproduced. What it does close
  // is the DURABLE form of the bug: main re-pushed /login on every subsequent app open until the
  // user actually completed the login screen, because the flag alone stayed undismissed forever.
  // Once the exchange lands, this check makes every later launch see the persisted session and skip
  // the push -- the spurious one-shot on the cold-start instant self-clears the moment the user hits
  // either exit on /login (both call done()). Closing the instant itself means gating redirect.tsx's
  // <Redirect> on the exchange, which touches the pinned #54 double-exchange guard
  // (shouldExchangeCode/isSignInInFlight) -- out of scope here, tracked separately.
  useEffect(() => {
    Promise.all([isFirstRunDismissed(), supabase.auth.getSession()]).then(([dismissed, { data }]) => {
      if (!dismissed && !data.session) router.push("/login");
    });
  }, []);

  return (
    <PaneStack
      activeIndex={activeIndex}
      onActiveIndexChange={setActiveIndex}
      topInset={insets.top}
      panes={[<SocialPane key="social" />, <HomePane key="home" />, <YouPane key="you" />]}
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
  hallZone: { position: "relative", height: fs(76), justifyContent: "flex-end" },
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
  hallCardStar: { position: "absolute", top: spacing(1), left: spacing(1.5), padding: spacing(1) },
  star: { fontSize: fs(18), color: withOpacity(colors.paper50, 45) },
  starActive: { color: colors.gold500 },

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
