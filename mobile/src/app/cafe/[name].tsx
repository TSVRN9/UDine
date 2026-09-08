import type { DiningHoursFeed } from "@udine/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HallMenuScreenBody, type HallMenuSubject } from "../halls/[slug]";
import { fetchHoursAndCache, getCachedHours } from "../../lib/menuHoursCache";
import { colors, fonts, fs, spacing } from "../../lib/theme";

/**
 * `/cafe/[name]` -- café-screen unification (this PR): ALWAYS the same pushed screen
 * (HallMenuScreenBody, shared verbatim with `/halls/[slug]`), regardless of what data is actually
 * available for this café that day. `name` is the café's own `name` (URL-encoded; retail locations
 * have no static slug list the way DINING_HALLS does, since they come from the live get_infov2
 * feed, not a hardcoded array).
 *
 * This screen's ONLY job is resolving `loc` (fetch hours, find the tapped name in `retail`) and
 * handing it to HallMenuScreenBody as a `HallMenuSubject` -- `hall.retailLoc` carries the raw
 * RetailLocationHours row down so that body's own waterfall (resolveCafeMenuState, cafeMenu.ts) can
 * try `fetchMenu(locationId, date)` (tier 1, `hall.tid`), then fall back to the standing-menu HTML
 * (tier 2/3, `hall.retailLoc`) -- ALL of that (including its own recordSeen tracking, retry-card/
 * cached-menu-on-failure handling) is HallMenuScreenBody's own fetch effect, not duplicated here;
 * an older version of this screen ran its own separate probe first to decide whether to push this
 * screen or hand off to a fallback sheet elsewhere -- since this screen is now ALWAYS what renders,
 * there's nothing left for that second fetch to decide, so it's gone (see git history/PR body for
 * the retired `cafeTapTarget`/cafeSheetHandoff.ts mechanism this replaces).
 */
export default function CafeScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const decodedName = decodeURIComponent(name ?? "");
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // #243 bug C: fetchHoursAndCache (not shared's bare fetchDiningHours), with a getCachedHours
    // fallback on failure -- same two-step pattern Home's own hours load() uses. Without the
    // fallback, a café row Home just rendered from a warm cache would still error out the moment
    // it's tapped while offline, since a live fetch fails identically either way; the fallback is
    // what actually rescues that case.
    fetchHoursAndCache()
      .then(setHoursFeed)
      .catch((e) => {
        getCachedHours()
          .then((cached) => {
            if (cached) setHoursFeed(cached.feed);
            else setError(String(e));
          })
          .catch(() => setError(String(e)));
      });
  }, []);

  const loc = hoursFeed?.retail?.find((r) => r.name === decodedName);
  // #243 bug D: a fresh `{tid, name}` object literal every render fed into HallMenuScreenBody's
  // `hall` prop -- whose fetch effects are keyed on that object's identity, not its contents (see
  // halls/[slug].tsx) -- meant any unrelated re-render of this screen (rotation, inset change) reset
  // its menu items to null and refetched, duplicating recordSeen. Memoized on `loc` itself (not just
  // the two primitives the pre-unification version used) so `retailLoc` -- read by
  // HallMenuScreenBody's own waterfall, never as an identity key -- rides along without widening
  // this memo's dependency list.
  const hall = useMemo<HallMenuSubject | null>(() => (loc ? { tid: loc.locationId, name: loc.name, retailLoc: loc } : null), [loc]);

  function loadingChrome(message: string) {
    return (
      <View style={styles.loadingScreen}>
        <View style={[styles.loadingHeader, { paddingTop: insets.top + spacing(4.5) }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
        </View>
        {message ? <Text style={styles.error}>{message}</Text> : <ActivityIndicator style={styles.loading} color={colors.maroon600} />}
      </View>
    );
  }

  if (error) {
    // A rejected fetchHoursAndCache with no cache to fall back to used to leave `hoursFeed` null
    // forever -- a permanent spinner behind only a back chevron, plus an unhandled promise
    // rejection (PR #219 review). The `.catch` above routes here instead, same shape as
    // halls/[slug].tsx's own `error` branch.
    return loadingChrome(`Failed to load ${decodedName}: ${error}`);
  }

  if (hoursFeed && !loc) {
    // Hours resolved and this name isn't in it -- a stale/mismatched Link target, not a load in
    // progress. This branch (plus the `error` branch above, for a rejected fetch) is what keeps
    // `loc` staying undefined, or the fetch never resolving, from spinning the loading state
    // indefinitely.
    return loadingChrome(`Couldn't find ${decodedName}.`);
  }

  if (!hall) {
    return loadingChrome("");
  }

  return <HallMenuScreenBody hall={hall} />;
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: colors.cream100 },
  loadingHeader: { paddingHorizontal: spacing(5), paddingBottom: spacing(1.5) },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  loading: { flex: 1, backgroundColor: colors.cream100 },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body400 },
});
