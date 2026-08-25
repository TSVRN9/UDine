import { fetchDiningHours, type DiningHoursFeed, type MenuItem } from "@udine/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CafePdfViewer } from "../../components/CafePdfViewer";
import { CafeSheet } from "../../components/CafeSheet";
import { HallMenuScreenBody } from "../halls/[slug]";
import { cafeTapTarget } from "../../lib/cafeMenu";
import { fetchMenuAndRecordSeen } from "../../lib/menuFetchWithSeenTracking";
import { colors, fonts, fs, spacing } from "../../lib/theme";

/**
 * `/cafe/[name]` -- #177's probe-at-tap runtime model. `name` is the café's own `name` (URL-
 * encoded; retail locations have no static slug list the way DINING_HALLS does, since they come
 * from the live get_infov2 feed, not a hardcoded array). Fetches hours fresh (Home's own hoursFeed
 * doesn't survive the navigation) to find this location, then -- only if it has a locationId --
 * probes `fetchMenu(locationId, today)` per the issue's "do not precompute tiers" runtime model.
 * Non-empty routes to the existing hall-menu screen body (HallMenuScreenBody, shared with
 * `/halls/[slug]`); empty renders the CafeSheet fallback instead.
 */
export default function CafeScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const decodedName = decodeURIComponent(name ?? "");
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [pdf, setPdf] = useState<{ url: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchDiningHours()
      .then(setHoursFeed)
      .catch((e) => setError(String(e)));
  }, []);

  const loc = hoursFeed?.retail?.find((r) => r.name === decodedName);

  useEffect(() => {
    if (!loc) return;
    if (loc.locationId === undefined) {
      setItems([]); // no tid to fetch with -- straight to the fallback sheet, no probe
      return;
    }
    let current = true;
    fetchMenuAndRecordSeen(loc.locationId, new Date())
      .then((result) => {
        if (current) setItems(result);
      })
      .catch((e) => {
        if (current) setError(String(e));
      });
    return () => {
      current = false;
    };
  }, [loc]);

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
    // Either fetch above (`fetchDiningHours` or `fetchMenuAndRecordSeen`) rejecting used to leave
    // `hoursFeed`/`items` null forever -- a permanent spinner behind only a back chevron, plus an
    // unhandled promise rejection (PR #219 review). Both `.catch`es above route here instead, same
    // shape as halls/[slug].tsx's own `error` branch.
    return loadingChrome(`Failed to load ${decodedName}: ${error}`);
  }

  if (hoursFeed && !loc) {
    // Hours resolved and this name isn't in it -- a stale/mismatched Link target, not a load in
    // progress. This branch (plus the `error` branch above, for a rejected fetch) is what keeps
    // `loc` staying undefined, or either fetch never resolving, from spinning the loading state
    // indefinitely (its own fetch effect above never fires without a `loc` to read locationId from).
    return loadingChrome(`Couldn't find ${decodedName}.`);
  }

  if (!hoursFeed || !loc || items === null) {
    return loadingChrome("");
  }

  const target = cafeTapTarget(loc.locationId, items);
  if (target.kind === "menu") {
    // loc.locationId is defined here -- cafeTapTarget only returns "menu" when it is.
    return <HallMenuScreenBody hall={{ tid: loc.locationId as number, name: loc.name }} />;
  }

  return (
    <View style={styles.loadingScreen}>
      <CafeSheet visible={!pdf} loc={loc} now={new Date()} onClose={() => router.back()} onOpenPdf={(url, label) => setPdf({ url, label })} />
      {pdf ? <CafePdfViewer url={pdf.url} label={pdf.label} cafeName={loc.name} onClose={() => setPdf(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: colors.cream100 },
  loadingHeader: { paddingHorizontal: spacing(5), paddingBottom: spacing(1.5) },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  loading: { flex: 1, backgroundColor: colors.cream100 },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body400 },
});
