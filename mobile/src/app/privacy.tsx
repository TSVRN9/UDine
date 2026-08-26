import { syncSharedStat, type SharedStatField } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, EmptyState, SectionHeader, Toggle } from "../components/ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { acceptedFriendCount, alertsSubline, countLabel, deviceDataCounts, profileSummaryLine } from "../lib/dataMap";
import { deleteServerData } from "../lib/deleteServerData";
import { deriveSharedStatsPayloads, fieldsNeedingRefresh, sharedStatValueForToggle } from "../lib/privacySettings";
import { useFavoriteFoodAlerts } from "../lib/favoriteFoodAlerts";
import { pendingSelfHeal } from "../lib/pendingSelfHeal";
import { withTimeout } from "../lib/withTimeout";
import { supabase } from "../lib/supabase";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { SqliteSeenDishesStorage } from "../lib/seenDishesStorage";

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();
const seenDishesStorage = new SqliteSeenDishesStorage();

// Same bounded wait as favoriteFoodAlerts.ts's toggle()-off and auth.ts's signOut() use for the
// identical self-heal race (#272).
const SELF_HEAL_WAIT_TIMEOUT_MS = 15000;

type SharedStatsRow = { completion: unknown; top_foods: unknown; hall_ranks: unknown } | null;

// #182: the artboard names five "Shared with friends" toggles (Today's calories, Logging streak,
// Hall completion, Top foods, Favorite halls), but #94's shared_stats backend only has three
// opt-in columns (completion/top_foods/hall_ranks) -- see the issue #182 comment thread. Today's
// calories and Logging streak have no backend field (adding one would be a new amendment to
// CLAUDE.md's device-only-health-data table, an owner call, not something to add silently here),
// so only the three that map onto real columns render. "Favorite halls" reads as `hall_ranks` (the
// full ranked order shared_stats stores), not the separate favorite_dining_halls table (that one
// isn't opt-in -- it syncs unconditionally on sign-in for ping-hall suggestions; wiring this toggle
// to it instead would make turning it "off" break pings, which the artboard's own copy doesn't
// describe).
// #237: what "Delete server data" actually does today -- ONE pair of clauses, reused by the confirm
// dialog, the row's own subline, AND the post-delete honest-copy alert, so no two of those three can
// drift apart the way the pre-#237 copy did (it claimed "profile" was removed when it never was).
//
// DELETE_REMOVES: friendships/favorited_foods/shared_stats/favorite_dining_halls/push_tokens/
// pings(sent) all have an owner DELETE policy + grant (see deleteServerData.ts's own doc comment).
// "the dining halls synced for ping suggestions" (not "favorite halls") is deliberate wording --
// favorite_dining_halls has no toggle of its own on this screen, but SHARED_TOGGLES above already
// has a toggle literally labeled "Favorite halls" for the unrelated hall_ranks column (part of
// shared_stats, already covered by "shared stats" earlier in the same sentence). Reusing "favorite
// halls" here would read as double-counting or naming the wrong table.
//
// DELETE_STAYS: profiles/food_sightings/qr_tokens have no owner DELETE policy or grant (attempted
// and reported as `undeletableSteps` -- see deleteServerData.ts). Pings a FRIEND sent to this user
// are not attempted at all (no receiver-delete policy exists, only the sender-delete one this user's
// own sent pings use) -- named here so this "stays" clause is the actual exhaustive list of
// server-side residue, not just the two/three tables that happen to be attempted-and-reported.
const DELETE_REMOVES = "Friendships, favorites, shared stats, the dining halls synced for ping suggestions, push tokens, and sent pings";
// #272: deleteServerData's new "notifications" step (profiles.update({notifications_enabled: false,
// discoverable: false})) is a state change, not a delete -- doesn't belong in DELETE_REMOVES's own
// "X, Y, and Z are gone" grammar, so it's its own sentence, still single-sourced here rather than
// hardcoded into both DELETE_SCOPE_SUMMARY and DELETE_SUCCESS_MESSAGE separately.
const DELETE_TURNS_OFF = "Turns off favorite-food alerts and friend-search discoverability.";
const DELETE_STAYS = "Your profile, food-sighting history, friend QR code, and pings friends sent you stay on the server -- deleting those isn't available yet.";
const DELETE_SCOPE_SUMMARY = `Removes ${DELETE_REMOVES.charAt(0).toLowerCase()}${DELETE_REMOVES.slice(1)}. ${DELETE_TURNS_OFF} ${DELETE_STAYS} Phone data stays.`;
const DELETE_SUCCESS_MESSAGE = `${DELETE_REMOVES} are gone. ${DELETE_TURNS_OFF} ${DELETE_STAYS}`;

const SHARED_TOGGLES: { field: SharedStatField; label: string }[] = [
  { field: "completion", label: "Hall completion" },
  { field: "top_foods", label: "Top foods" },
  { field: "hall_ranks", label: "Favorite halls" },
];

type Friendship = { status: string };

/**
 * "Your data" screen (#182, artboard "Your data (final)") -- opens from the You pane's "Your data"
 * row. Three carded groups + a destructive row:
 *  1. Stays on this phone -- device-local counts, always visible (no account needed; this screen
 *     IS the residency UI CLAUDE.md's data-table calls for).
 *  2. On UDine's server -- profile/friends summary + the favorite-food-alerts toggle (reuses
 *     useFavoriteFoodAlerts, the same hook/backend app/notifications.tsx uses).
 *  3. Shared with friends -- the three real shared_stats toggles (see SHARED_TOGGLES above),
 *     ported verbatim from the previous version of this screen (same "privacy by presence"
 *     refresh-on-focus behavior, same #94 semantics).
 * Groups 2/3 and the delete row require a session; group 1 does not.
 */
export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [row, setRow] = useState<SharedStatsRow>(null);
  const [pending, setPending] = useState<SharedStatField | null>(null);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [counts, setCounts] = useState({ logEntryCount: 0, rankedCount: 0, seenDishCount: 0 });
  const [deleting, setDeleting] = useState(false);
  const alerts = useFavoriteFoodAlerts();
  // #186: refresh()'s re-push loop below can be mid-flight (parked on an await) when the user
  // revokes a field via toggleShared -- without this, the stale loop resumes and re-pushes the
  // field's old value, resurrecting a stat the user just deleted server-side. toggleShared bumps
  // this on every real toggle; confirmDelete bumps it too (#241, same hazard for "Delete server
  // data" -- deleteServerData wipes the row, and without the bump the parked loop would resurrect
  // it right after). refresh captures the value at its own start and checks it again before EACH
  // re-push, dropping the push if a toggle or delete happened in between.
  const generationRef = useRef(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    const startGeneration = generationRef.current;
    const [entries, rankedDishes, rankedFoods, seenByHall] = await Promise.all([
      logStorage.getAllEntries(),
      rankingStorage.getRankedDishes(),
      rankingStorage.getRankedFoods(),
      seenDishesStorage.getAllSeenDishNames(),
    ]);
    setCounts(deviceDataCounts(entries, rankedDishes, rankedFoods, seenByHall));

    const myId = session?.user.id;
    if (!myId) {
      setRow(null);
      setFriendships([]);
      return;
    }

    const { data } = await supabase.from("shared_stats").select("completion, top_foods, hall_ranks").eq("user_id", myId).maybeSingle();
    setRow(data ?? null);

    const { data: friendshipRows } = await supabase.from("friendships").select("status").or(`user_a.eq.${myId},user_b.eq.${myId}`);
    setFriendships(friendshipRows ?? []);

    // Re-push already-opted-in fields with a fresh value -- never opts a new field in (see
    // fieldsNeedingRefresh's own doc comment; ported verbatim from the previous version of this
    // screen).
    const toRefresh = fieldsNeedingRefresh(data ?? null);
    if (toRefresh.length === 0) return;
    const derived = deriveSharedStatsPayloads(seenByHall, entries, rankedDishes, rankedFoods);
    for (const field of toRefresh) {
      // A toggle landed since this refresh started -- its own write is the current truth now;
      // pushing this stale re-derived value would resurrect a field the toggle just revoked (or
      // stomp a field it just opted in with an older payload). See #186.
      if (generationRef.current !== startGeneration) return;
      await syncSharedStat(supabase, myId, field, sharedStatValueForToggle(field, true, derived));
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function toggleShared(field: SharedStatField, next: boolean) {
    const myId = session?.user.id;
    if (!myId) return;
    generationRef.current += 1; // invalidate any in-flight refresh() re-push loop -- see #186
    setPending(field);
    try {
      let value: unknown = null;
      if (next) {
        const [entries, rankedDishes, rankedFoods, seenByHall] = await Promise.all([
          logStorage.getAllEntries(),
          rankingStorage.getRankedDishes(),
          rankingStorage.getRankedFoods(),
          seenDishesStorage.getAllSeenDishNames(),
        ]);
        const derived = deriveSharedStatsPayloads(seenByHall, entries, rankedDishes, rankedFoods);
        value = sharedStatValueForToggle(field, true, derived);
      }
      const { error } = await syncSharedStat(supabase, myId, field, value);
      if (error) {
        // Toggle reverts (no local state change below) + message -- #158/#165/#167 convention.
        console.warn(`[privacy] toggle(${field}, ${next}) failed`, error);
        Alert.alert("Couldn't update sharing", "Please try again.");
        return;
      }
      setRow((prev) => ({ completion: prev?.completion ?? null, top_foods: prev?.top_foods ?? null, hall_ranks: prev?.hall_ranks ?? null, [field]: value }));
    } finally {
      setPending(null);
    }
  }

  async function toggleAlerts(next: boolean) {
    const { error } = await alerts.toggle(next);
    if (error) Alert.alert("Couldn't update notifications", "Please try again.");
  }

  function goToExport() {
    router.push("/export");
  }

  async function confirmDelete() {
    const myId = session?.user.id;
    if (!myId) return;
    Alert.alert("Delete server data?", DELETE_SCOPE_SUMMARY, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          generationRef.current += 1; // invalidate any in-flight refresh() re-push loop -- see #186/#241
          setDeleting(true);
          try {
            // #272: the alerts hook's own refresh() (this screen's own useFocusEffect, above) can
            // have a self-heal re-registration already in flight -- a real network round trip --
            // when Delete is confirmed. Without waiting for it here, that self-heal's
            // register_push_token can land AFTER deleteServerData's push_tokens delete, with a
            // still-live session, resurrecting the row this delete just removed (send-ping-push
            // doesn't gate on notifications_enabled, so ping pushes would keep arriving to a device
            // whose server data the user just deleted). Same bounded await-before-delete ordering
            // as favoriteFoodAlerts.ts's toggle()-off and auth.ts's signOut() use for this race.
            const heal = pendingSelfHeal();
            if (heal) {
              try {
                await withTimeout(heal, SELF_HEAL_WAIT_TIMEOUT_MS, "pendingSelfHeal (delete server data)");
              } catch (e) {
                console.warn("[privacy] confirmDelete: waiting for an in-flight self-heal timed out or failed -- proceeding with delete anyway", e);
              }
            }
            const result = await deleteServerData(supabase, myId);
            // #237: only a genuinely RETRYABLE failure gets "try again" copy -- profiles/
            // food_sightings show up in `undeletableSteps`, not `failedSteps`, precisely so this
            // branch (and its "try again", which would never once succeed for them) doesn't fire
            // on every single invocation.
            if (result.failedSteps.length > 0) {
              Alert.alert("Couldn't delete everything", `Failed: ${result.failedSteps.join(", ")}. Please try again.`);
              return;
            }
            setRow(null);
            setFriendships([]);
            // #272: deleteServerData's own "notifications" step already flipped
            // notifications_enabled=false server-side (before push_tokens was deleted, so the row
            // can't be resurrected by a later focus) -- this re-reads that state into the alerts
            // hook immediately, so the toggle reads OFF without waiting for the user to leave and
            // come back to this screen.
            await alerts.refresh();
            if (result.undeletableSteps.length > 0) {
              Alert.alert("Server data deleted", DELETE_SUCCESS_MESSAGE);
            }
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing(4.5) }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Your data</Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Stays on this phone" />
        <Card>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Food log & macro history</Text>
            <Text style={styles.rowCount}>{countLabel(counts.logEntryCount, "entries")}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Dish & food rankings</Text>
            <Text style={styles.rowCount}>{countLabel(counts.rankedCount, "ranked")}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Seen-dish index</Text>
            <Text style={styles.rowCount}>{countLabel(counts.seenDishCount, "dishes")}</Text>
          </View>
          <View style={styles.divider} />
          <Pressable style={styles.exportRow} onPress={goToExport}>
            <Text style={styles.exportText}>EXPORT · JSON / CSV</Text>
            <Text style={styles.exportChevron}>›</Text>
          </Pressable>
        </Card>
      </View>

      {!session ? (
        <View style={styles.section}>
          <EmptyState title="Sign in required" message="Sign in to sync favorite-food alerts and control what friends can see." />
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <SectionHeader title="On UDine's server" />
            <Card>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Profile & friends</Text>
                <Text style={styles.rowCount}>{profileSummaryLine(session.user.email ?? "", acceptedFriendCount(friendships))}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.alertsRow}>
                <View style={styles.alertsText}>
                  <Text style={styles.rowLabel}>Favorite-food alerts</Text>
                  <Text style={styles.alertsSubline}>{alertsSubline(alerts.favoritesCount)}</Text>
                </View>
                <Toggle value={alerts.notificationsEnabled} onValueChange={toggleAlerts} />
              </View>
            </Card>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Shared with friends" />
            <Card>
              {SHARED_TOGGLES.map(({ field, label }, i) => (
                <View key={field}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.sharedRow}>
                    <Text style={styles.rowLabel}>{label}</Text>
                    <Toggle value={row?.[field] != null} onValueChange={(next) => toggleShared(field, next)} disabled={pending === field} />
                  </View>
                </View>
              ))}
            </Card>
            <Text style={styles.footer}>Off by default · accepted friends only · switching off deletes it from the server immediately.</Text>
          </View>

          <View style={styles.section}>
            <Pressable style={styles.deleteCard} onPress={confirmDelete} disabled={deleting}>
              <View style={styles.deleteText}>
                <Text style={styles.deleteLabel}>Delete server data</Text>
                <Text style={styles.deleteSubline}>{DELETE_SCOPE_SUMMARY}</Text>
              </View>
              <Text style={styles.deleteChevron}>›</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  container: { paddingHorizontal: spacing(5), paddingBottom: spacing(10), gap: spacing(3) },

  header: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  backChevron: { fontFamily: fonts.body600, fontSize: fs(28), color: colors.maroon900, lineHeight: fs(28) },
  headerTitle: { fontFamily: fonts.display700, fontSize: fs(22), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },

  section: { gap: spacing(2) },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: spacing(2), paddingHorizontal: spacing(3.5) },
  rowLabel: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.ink900 },
  rowCount: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  divider: { height: 1, backgroundColor: withOpacity(colors.ink900, 8), marginHorizontal: spacing(3.5) },

  exportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing(2.75),
    paddingHorizontal: spacing(3.5),
    minHeight: fs(44),
  },
  exportText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600 },
  exportChevron: { fontFamily: fonts.body400, fontSize: fs(16), color: colors.maroon600 },

  alertsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing(2), paddingVertical: spacing(2), paddingHorizontal: spacing(3.5), minHeight: fs(44) },
  alertsText: { flex: 1, gap: 2 },
  alertsSubline: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },

  sharedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing(2), paddingHorizontal: spacing(3.5), minHeight: fs(42) },

  footer: { fontFamily: fonts.body400, fontSize: fs(11), lineHeight: fs(15.4), color: withOpacity(colors.ink900, 55) },

  deleteCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.paper50,
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 35),
    borderRadius: radii.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
    minHeight: fs(44),
    gap: spacing(2),
  },
  deleteText: { flex: 1, gap: 2 },
  deleteLabel: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon600 },
  deleteSubline: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
  deleteChevron: { fontFamily: fonts.body400, fontSize: fs(16), color: colors.maroon600 },
});
