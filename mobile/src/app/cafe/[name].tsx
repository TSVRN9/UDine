import type { DiningHoursFeed } from "@udine/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HallMenuScreenBody, type HallMenuSubject } from "../halls/[slug]";
import { fetchHoursAndCache, getCachedHours } from "../../lib/menuHoursCache";
import { colors, fonts, fs, spacing } from "../../lib/theme";

/**
 * Always the same pushed screen (HallMenuScreenBody, shared with `/halls/[slug]`), regardless of
 * what data is available for this café. `name` is the café's URL-encoded name -- retail locations
 * have no static slug list, they come from the live get_infov2 feed.
 *
 * This screen's only job is resolving `loc` and handing it to HallMenuScreenBody as a
 * HallMenuSubject; `retailLoc` carries the raw RetailLocationHours row down so
 * HallMenuScreenBody's own waterfall (resolveCafeMenuState, cafeMenu.ts) can fall back to the
 * standing-menu HTML when a live menu fetch fails.
 */
export default function CafeScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const decodedName = decodeURIComponent(name ?? "");
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // fetchHoursAndCache with a getCachedHours fallback on failure rescues a café row Home
    // rendered from a warm cache when it's tapped while offline (a live fetch fails either way).
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
  // Memoized on `loc`: HallMenuScreenBody's fetch effects key on `hall`'s identity, not its
  // contents, so a fresh object literal every render would reset menu items and refetch on any
  // unrelated re-render (rotation, inset change).
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
    return loadingChrome(`Failed to load ${decodedName}: ${error}`);
  }

  if (hoursFeed && !loc) {
    // Hours resolved but this name isn't in it -- a stale/mismatched Link target, not still loading.
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
