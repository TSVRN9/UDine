import type { DiningHoursFeed, MenuItem } from "@udine/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HallMenuScreenBody, type HallMenuSubject } from "../halls/[slug]";
import { cafeTapTarget } from "../../lib/cafeMenu";
import { requestCafeSheet } from "../../lib/cafeSheetHandoff";
import { fetchMenuAndRecordSeen } from "../../lib/menuFetchWithSeenTracking";
import { fetchHoursAndCache, getCachedHours, getCachedMenu } from "../../lib/menuHoursCache";
import { colors, fonts, fs, spacing } from "../../lib/theme";

/**
 * `/cafe/[name]` -- #177's probe-at-tap runtime model. `name` is the café's own `name` (URL-
 * encoded; retail locations have no static slug list the way DINING_HALLS does, since they come
 * from the live get_infov2 feed, not a hardcoded array). Fetches hours fresh (Home's own hoursFeed
 * doesn't survive the navigation) to find this location, then -- only if it has a locationId --
 * probes `fetchMenu(locationId, today)` per the issue's "do not precompute tiers" runtime model.
 * Non-empty routes to the existing hall-menu screen body (HallMenuScreenBody, shared with
 * `/halls/[slug]`); empty hands off to HomePane's own CafeSheet instead of rendering one here --
 * see cafeSheetHandoff.ts for why (this used to render CafeSheet inline, which meant a blank
 * pushed screen behind the sheet instead of the sheet alone over Home).
 */
export default function CafeScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const decodedName = decodeURIComponent(name ?? "");
  const [hoursFeed, setHoursFeed] = useState<DiningHoursFeed | null>(null);
  const [items, setItems] = useState<MenuItem[] | null>(null);
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
  // items to null and refetched, duplicating recordSeen. Memoized on the two primitive values that
  // actually identify the café, so identity only changes when the café itself does.
  const hall = useMemo<HallMenuSubject | null>(
    () => (loc?.locationId === undefined ? null : { tid: loc.locationId, name: loc.name }),
    [loc?.locationId, loc?.name],
  );

  useEffect(() => {
    if (!loc) return;
    if (loc.locationId === undefined) {
      setItems([]); // no tid to fetch with -- straight to the fallback sheet, no probe
      return;
    }
    let current = true;
    const date = new Date();
    const locationId = loc.locationId;
    fetchMenuAndRecordSeen(locationId, date)
      .then((result) => {
        if (current) setItems(result);
      })
      .catch((e) => {
        if (!current) return;
        // #243 bug C, second half: an offline tap that DOES resolve `loc` from the hours cache
        // above still has to probe the live menu -- which fails the same way offline. Falling back
        // to a cached menu (same getCachedMenu store menuFetchWithSeenTracking.ts already writes
        // to on every success) is what actually makes the tap succeed instead of just moving the
        // error one fetch later; no cached menu at all degrades to the CafeSheet fallback (loc's
        // own description/hours/standing-menu HTML render fine from the cache alone) rather than a
        // hard error, since there's genuinely nothing else to show.
        getCachedMenu(locationId, date)
          .then((cached) => {
            if (current) setItems(cached ? cached.items : []);
          })
          .catch(() => {
            if (current) setItems([]);
          });
      });
    return () => {
      current = false;
    };
  }, [loc]);

  const target = hoursFeed && loc && items !== null ? cafeTapTarget(loc.locationId, items) : null;

  // Sheet-only outcome (no locationId, or a locationId that probed empty -- e.g. a
  // standing-menu-only location) hands off to HomePane's own CafeSheet instead of rendering one
  // here -- see cafeSheetHandoff.ts. Dependency array is `target?.kind` (a stable string), not
  // `target` itself -- cafeTapTarget returns a fresh object literal every call, so depending on
  // the object would re-fire this effect (and call router.back() again) on every render once
  // resolved, not just the one transition into "sheet".
  useEffect(() => {
    if (target?.kind !== "sheet" || !loc) return;
    requestCafeSheet(loc.name);
    router.back();
  }, [target?.kind, loc]);

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
    // Either fetch above (`fetchHoursAndCache`+`getCachedHours` or `fetchMenuAndRecordSeen`) rejecting used to leave
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

  if (!target) {
    return loadingChrome("");
  }

  if (target.kind === "menu") {
    // hall is non-null here -- cafeTapTarget only returns "menu" when loc.locationId is defined.
    return <HallMenuScreenBody hall={hall!} />;
  }

  // "sheet" -- the handoff effect above is popping this screen back to Home imminently; render
  // nothing but the loading chrome in the meantime so there's no content flash behind it.
  return loadingChrome("");
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: colors.cream100 },
  loadingHeader: { paddingHorizontal: spacing(5), paddingBottom: spacing(1.5) },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  loading: { flex: 1, backgroundColor: colors.cream100 },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body400 },
});
