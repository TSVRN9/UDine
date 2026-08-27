import { syncDiningHallRanks, syncSharedStat, type RankedDish, type SharedStatField } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, EmptyState, SectionHeader, Toggle } from "../components/ui";
import { colors, fonts, fs, spacing, withOpacity } from "../lib/theme";
import { acceptedFriendCount, alertsSubline, countLabel, deviceDataCounts, profileSummaryLine } from "../lib/dataMap";
import { isHallSyncEnabled, setHallSyncEnabled } from "../lib/hallSyncPreference";
import { SHARED_STAT_FIELDS, deriveSharedStatsPayloads, fieldsNeedingRefresh, sharedStatValueForToggle, shouldSeedSharedStatsDefault } from "../lib/privacySettings";
import { useFavoriteFoodAlerts } from "../lib/favoriteFoodAlerts";
import { dismissSharedStatsDisclosure, hasSeededSharedStatsDefault, isSharedStatsDisclosureDismissed, markSharedStatsDefaultSeeded } from "../lib/sharedStatsSeed";
import { supabase } from "../lib/supabase";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";
import { SqliteSeenDishesStorage } from "../lib/seenDishesStorage";

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();
const seenDishesStorage = new SqliteSeenDishesStorage();

type SharedStatsRow = { completion: unknown; top_foods: unknown; hall_ranks: unknown } | null;

// #285 ("Your Data v3", variant A): the previous "Delete server data" button is gone -- SYNC toggle
// off IS the delete now, immediately, per category. No separate delete path exists any more for the
// four SYNC categories below; deleteServerData.ts (the old whole-account delete) is unreferenced by
// this screen as of this change, left in place for #253's future account-delete work rather than
// deleted along with its own test file.
//
// SYNC: what leaves the phone at all. "Favorite dining halls" here is the favorite_dining_halls
// table (ping-hall suggestions) -- it has no shared_stats column of its own, so its on/off state is
// a device-local preference (hallSyncPreference.ts) that also gates rank.tsx's own sync call.
// "Hall completion"/"Top 5 foods" are shared_stats.completion/top_foods -- reuses the existing
// per-field syncSharedStat(..., null) revoke (#186/#241 guarded) verbatim.
const SYNC_STAT_TOGGLES: { field: SharedStatField; label: string }[] = [
  { field: "completion", label: "Hall completion" },
  { field: "top_foods", label: "Top 5 foods" },
];

// SHARE: what an accepted friend can actually see. Disabled (greyed) while the paired SYNC toggle
// above is off -- a stat that isn't synced can't be shared. "Favorite dining halls" SHARE reads as
// `hall_ranks` (shared_stats' full ranked hall order) -- a different table than its SYNC namesake;
// they split naturally because favorite_dining_halls (owner-only, ping suggestions) and
// shared_stats.hall_ranks (the shared cut) already are two different columns. Hall completion/Top 5
// foods get no SHARE row of their own: today `shared_stats` has no independent visibility flag, so
// syncing one of those two IS sharing it (see PR body for the schema-consequence decision).
const SHARE_HALL_RANKS_FIELD: SharedStatField = "hall_ranks";

type Friendship = { status: string };

/**
 * "Your data" screen (#182 original, rebuilt for #285/variant A) -- opens from the You pane's "Your
 * data" row. Three sections:
 *  1. Stays on this phone -- device-local counts, always visible (no account needed; this screen
 *     IS the residency UI CLAUDE.md's data-table calls for).
 *  2. On UDine's server (SYNC) -- profile/friends summary (info only) + four toggles: Favorite
 *     foods (useFavoriteFoodAlerts, unchanged), Favorite dining halls (new, device-local pref),
 *     Hall completion, Top 5 foods (both shared_stats, reusing privacySettings.ts verbatim).
 *  3. Shared with friends (SHARE) -- two toggles: Favorite dining halls (shared_stats.hall_ranks,
 *     disabled while its SYNC pair is off) and Findable by search (profiles.discoverable, same
 *     column add-friends.tsx's own toggle reads/writes).
 * Sections 2/3 require a session; section 1 does not. "Toggle off IS the delete" for every SYNC
 * row -- there is no separate delete button any more.
 *
 * #248 Part C (2026-08-26, reconciled into this rebuild rather than dropped): new accounts get all
 * three shared_stats fields (completion, top_foods, hall_ranks) seeded ON via a one-time client-
 * driven push on this screen's first load (refresh()'s seed block below, shouldSeedSharedStatsDefault
 * in privacySettings.ts) -- the seed only decides the INITIAL value of each field; the SYNC/SHARE
 * toggles above still work exactly as #285 describes afterward (toggle off still deletes
 * immediately). hall_ranks's SHARE toggle is never seeded into a disabled state: favorite dining
 * halls SYNC (hallSyncPreference) defaults to enabled for every device, seeded or not, so a newly
 * seeded account never has its SHARE row seeded ON while greyed out.
 */
export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [row, setRow] = useState<SharedStatsRow>(null);
  const [pending, setPending] = useState<SharedStatField | null>(null);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  // #248 Part C: true once this account has been through the one-time default-on seed (this focus
  // or a previous one -- see sharedStatsSeed.ts's persisted marker), which is also exactly the
  // condition for showing the first-run disclosure below. An existing (pre-2026-08-26) account, or
  // one that opted in manually before this shipped, is never true here -- they weren't defaulted on
  // without asking, so there's nothing to disclose.
  const [seededThisAccount, setSeededThisAccount] = useState(false);
  const [disclosureDismissed, setDisclosureDismissed] = useState(false);
  const [counts, setCounts] = useState({ logEntryCount: 0, rankedCount: 0, seenDishCount: 0 });
  const [hallSyncOn, setHallSyncOn] = useState(true);
  const [hallSyncPending, setHallSyncPending] = useState(false);
  const [discoverable, setDiscoverable] = useState(true);
  const [findablePending, setFindablePending] = useState(false);
  const alerts = useFavoriteFoodAlerts();
  // #186: refresh()'s re-push loop below can be mid-flight (parked on an await) when the user
  // revokes a field via toggleShared/toggleHallSync -- without this, the stale loop resumes and
  // re-pushes the field's old value, resurrecting a stat the user just deleted server-side.
  // refresh captures the value at its own start and checks it again before EACH re-push, dropping
  // the push if a toggle happened in between. #248 Part C's seed loop reuses the same guard (see
  // below) rather than duplicating it.
  const generationRef = useRef(0);
  // #285: toggleHallSync(true) re-pushes the CURRENT ranking immediately (same "toggle on pushes
  // the current derived value" convention as the shared_stats toggles) -- refresh() already loads
  // rankedDishes to compute device counts, so this just keeps the latest copy around instead of a
  // second SqliteRankingStorage read.
  const rankedDishesRef = useRef<RankedDish[]>([]);

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
    rankedDishesRef.current = rankedDishes;

    const myId = session?.user.id;
    if (!myId) {
      setRow(null);
      setFriendships([]);
      return;
    }

    setHallSyncOn(await isHallSyncEnabled());

    const { data } = await supabase.from("shared_stats").select("completion, top_foods, hall_ranks").eq("user_id", myId).maybeSingle();
    setRow(data ?? null);

    const { data: profile } = await supabase.from("profiles").select("discoverable").eq("user_id", myId).maybeSingle();
    setDiscoverable((profile as { discoverable?: boolean } | null)?.discoverable ?? true);

    const { data: friendshipRows } = await supabase.from("friendships").select("status").or(`user_a.eq.${myId},user_b.eq.${myId}`);
    setFriendships(friendshipRows ?? []);

    // #248 Part C: one-time default-on seed. shouldSeedSharedStatsDefault (privacySettings.ts) is
    // the actual decision -- this block is just its IO shell. `alreadySeeded` also drives whether
    // the first-run disclosure card renders below, independent of whether THIS refresh seeds
    // anything (a returning already-seeded user must keep seeing it until dismissed).
    //
    // PR #286 review: the marker (and the disclosure it gates) must be written as soon as ANY
    // field successfully pushes, not only on a clean sweep of all three. A field that pushed
    // before a later field failed is ALREADY shared server-side -- that's what triggers the "you
    // were shared without asking" disclosure obligation, and it's true at the first success, not
    // the third. Gating the marker on a full clean run left a partially-seeded user (one real
    // field shared with every accepted friend) with the marker unwritten, so the disclosure never
    // showed AND -- because a successful push already created the shared_stats row -- the next
    // focus's `row === null` gate blocked ever retrying the remaining field(s) either. Once any
    // field lands, the remaining, never-attempted field(s) simply stay off -- not retried, same
    // fail-partial-closed ceiling as before, just now correctly disclosed and never mistaken for
    // "nothing happened yet".
    //
    // Non-blocking, noted not fixed (PR #286 review): two overlapping refresh() calls (e.g. a rapid
    // double-focus) could both pass the `hasSeededSharedStatsDefault` check before either writes the
    // marker, and both run the seed loop. Every syncSharedStat write here is an idempotent upsert of
    // the same derived value, so the worst case is redundant network calls, never a wrong end state
    // (no field ends up with two different values, no marker corruption) -- not worth a lock for.
    const alreadySeeded = await hasSeededSharedStatsDefault(myId);
    let seededNow = false;
    if (shouldSeedSharedStatsDefault({ row: data ?? null, createdAt: session?.user.created_at, alreadySeeded })) {
      const derivedForSeed = deriveSharedStatsPayloads(seenByHall, entries, rankedDishes, rankedFoods);
      for (const field of SHARED_STAT_FIELDS) {
        // #186/#241/#217 guard, reused: a toggle or a hall-sync cascade firing mid-seed bumps
        // generationRef. Checked before starting this field's push (a race during an earlier await
        // in this same refresh) -- if the race already happened, don't even start.
        if (generationRef.current !== startGeneration) break;
        const value = sharedStatValueForToggle(field, true, derivedForSeed);
        const { error } = await syncSharedStat(supabase, myId, field, value);
        if (error) {
          console.warn(`[privacy] default-on seed: syncSharedStat(${field}) failed`, error);
          break; // not retried once any field has already succeeded -- see the doc comment above
        }
        // PR #286 review round 2: credited BEFORE the post-await race check below, deliberately --
        // this field's write already landed on the server the instant `error` came back null, full
        // stop, regardless of anything that raced in during the await (a toggle on THIS field or a
        // DIFFERENT one). The old ordering (race check first) meant a toggle on a different field
        // firing during this exact await silently discarded a real, already-successful share: the
        // marker was never written and the disclosure never shown for a field the account WAS
        // shared on. Marking "seeded" is a statement about what happened, not what's still true a
        // moment later -- a same-field toggle-off immediately after still correctly ends up OFF
        // (that's the local-state guard right below), it just doesn't erase the fact that this
        // account was defaulted into sharing at least once, which is what the marker/disclosure are
        // actually for.
        seededNow = true;
        // Local `row` state, unlike the credit above, DOES still need the race check: a toggle (on
        // this field or another) that landed during the await above already wrote its own, newer
        // `row` state via toggleShared's own setRow -- this seed loop must not clobber it with a
        // stale value. Stopping the loop here (not just skipping this one setRow) is deliberate too:
        // the user is now actively interacting with this screen, so the remaining fields are better
        // left for the NEXT focus's fieldsNeedingRefresh/seed pass than pushed blind mid-interaction.
        if (generationRef.current !== startGeneration) break;
        setRow((prev) => ({ completion: prev?.completion ?? null, top_foods: prev?.top_foods ?? null, hall_ranks: prev?.hall_ranks ?? null, [field]: value }));
      }
      if (seededNow) await markSharedStatsDefaultSeeded(myId);
    }
    setSeededThisAccount(alreadySeeded || seededNow);
    // Unconditional, not gated on seededThisAccount -- always reflects THIS user's own dismissal
    // state so a signed-out/signed-in account switch on the same device can never carry over a
    // stale dismissal from whichever account was previously loaded in this component's state.
    setDisclosureDismissed(await isSharedStatsDisclosureDismissed(myId));

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

  // #248 Part C: dismisses the "these three stats share by default" first-run note. Only ever
  // rendered for a seeded account (see seededThisAccount above), so there's no case where this is
  // called for a user who wasn't actually defaulted on.
  async function dismissDisclosure() {
    const myId = session?.user.id;
    if (!myId) return;
    await dismissSharedStatsDisclosure(myId);
    setDisclosureDismissed(true);
  }

  // #285: "Favorite dining halls" SYNC. Off deletes favorite_dining_halls immediately AND turns its
  // SHARE pair (shared_stats.hall_ranks) off with it -- the issue's own "turning SYNC off deletes
  // the server copy immediately and turns that category's SHARE off with it" rule. On re-pushes the
  // current ranking right away (same convention as the other SYNC toggles), rather than waiting for
  // the user's next comparison on /rank.
  async function toggleHallSync(next: boolean) {
    const myId = session?.user.id;
    if (!myId) return;
    generationRef.current += 1; // same stale-re-push guard toggleShared uses -- see #186
    setHallSyncPending(true);
    try {
      if (!next) {
        const { error: deleteError } = await supabase.from("favorite_dining_halls").delete().eq("user_id", myId);
        if (deleteError) {
          console.warn("[privacy] toggleHallSync(false): favorite_dining_halls delete failed", deleteError);
          Alert.alert("Couldn't update sync", "Please try again.");
          return;
        }
        const { error: shareError } = await syncSharedStat(supabase, myId, SHARE_HALL_RANKS_FIELD, null);
        if (shareError) {
          // Same honest-failure treatment as toggleShared: don't optimistically flip SYNC off (or
          // clear hall_ranks locally) when the server-side clear actually failed. Note the
          // favorite_dining_halls delete above has already succeeded by this point, so the UI now
          // shows SYNC=ON with the halls rows already gone server-side -- that's the right side to
          // err on (never under-claim what's still shared; hall_ranks SHARE stays ON because it's
          // still actually present), and the next rank change re-syncs favorite_dining_halls anyway
          // (syncDiningHallRanks's own "a failed sync is a re-derivable summary" contract).
          console.warn("[privacy] toggleHallSync(false): hall_ranks clear failed", shareError);
          Alert.alert("Couldn't update sync", "Please try again.");
          return;
        }
        setRow((prev) => ({ completion: prev?.completion ?? null, top_foods: prev?.top_foods ?? null, hall_ranks: null }));
      } else {
        void syncDiningHallRanks(supabase, myId, rankedDishesRef.current);
      }
      await setHallSyncEnabled(next);
      setHallSyncOn(next);
    } finally {
      setHallSyncPending(false);
    }
  }

  async function toggleFindable(next: boolean) {
    const myId = session?.user.id;
    if (!myId) return;
    setFindablePending(true);
    try {
      const { error } = await supabase.from("profiles").update({ discoverable: next }).eq("user_id", myId);
      if (error) {
        Alert.alert("Couldn't update this setting", "Please try again.");
        return;
      }
      setDiscoverable(next);
    } finally {
      setFindablePending(false);
    }
  }

  function goToExport() {
    router.push("/export");
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
          <Pressable style={styles.exportRow} onPress={goToExport} accessibilityRole="button">
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
          {/* #248 Part C: one-time first-run notice for an account that was just (or previously)
              defaulted into sharing -- gated on seededThisAccount (see refresh()'s seed block) so an
              existing account that was never auto-seeded never sees this. Sits above both sections
              below since the three defaulted fields span both (Hall completion/Top 5 foods are SYNC
              toggles, Favorite dining halls sharing is a SHARE toggle) -- a single section-scoped
              placement would misleadingly imply only that section's toggles were affected. */}
          {seededThisAccount && !disclosureDismissed && (
            <Card style={styles.disclosureCard}>
              <Text style={styles.disclosureText}>
                Hall completion, top 5 foods, and favorite dining halls sharing are on by default for new accounts. Turn any of them off below -- that deletes it from the server right away.
              </Text>
              <Pressable onPress={dismissDisclosure} hitSlop={8} accessibilityRole="button">
                <Text style={styles.disclosureDismiss}>GOT IT</Text>
              </Pressable>
            </Card>
          )}

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
                  <Text style={styles.rowLabel}>Favorite foods</Text>
                  {/* PR #286 review (Part B): notifications_enabled defaulting true (#248) can be
                      true server-side for a device that never granted OS permission and so never
                      registered a token or synced a favorite -- rendering ON here would be exactly
                      the lie the review flagged. needsPermission (useFavoriteFoodAlerts) renders
                      this row as a needs-action prompt instead; tapping it runs the same toggle(true)
                      path, the only one that ever calls requestPermissionsAsync -- this row never
                      prompts on its own just by being visited. */}
                  <Text style={styles.alertsSubline}>
                    {alerts.notificationsEnabled && alerts.needsPermission ? "Tap to finish turning on -- allow notifications when asked." : alertsSubline(alerts.favoritesCount)}
                  </Text>
                </View>
                {/* #190: this was the one toggle on this screen that skipped the #158/#165/#167
                    disabled-while-pending convention its four siblings below all use -- a rapid
                    ON->OFF tap could fire a second alerts.toggle() mid-chain. */}
                <Toggle value={alerts.notificationsEnabled && !alerts.needsPermission} onValueChange={toggleAlerts} disabled={alerts.pending} />
              </View>
              <View style={styles.divider} />
              <View style={styles.alertsRow}>
                <View style={styles.alertsText}>
                  <Text style={styles.rowLabel}>Favorite dining halls</Text>
                  <Text style={styles.alertsSubline}>Enables "come eat with me" ping suggestions.</Text>
                </View>
                <Toggle value={hallSyncOn} onValueChange={toggleHallSync} disabled={hallSyncPending} />
              </View>
              {SYNC_STAT_TOGGLES.map(({ field, label }) => (
                <View key={field}>
                  <View style={styles.divider} />
                  <View style={styles.sharedRow}>
                    <Text style={styles.rowLabel}>{label}</Text>
                    <Toggle value={row?.[field] != null} onValueChange={(next) => toggleShared(field, next)} disabled={pending === field} />
                  </View>
                </View>
              ))}
            </Card>
            <Text style={styles.footer}>
              Turning one off deletes it from the server immediately · hall completion and top 5 foods are visible to accepted friends only.
            </Text>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Shared with friends" />
            <Card>
              <View style={[styles.sharedRow, !hallSyncOn && styles.rowDisabled]}>
                <View style={styles.alertsText}>
                  <Text style={styles.rowLabel}>Favorite dining halls</Text>
                  {!hallSyncOn && <Text style={styles.alertsSubline}>Turn on sync above to share.</Text>}
                </View>
                <Toggle
                  value={row?.[SHARE_HALL_RANKS_FIELD] != null}
                  onValueChange={(next) => toggleShared(SHARE_HALL_RANKS_FIELD, next)}
                  disabled={!hallSyncOn || pending === SHARE_HALL_RANKS_FIELD}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.sharedRow}>
                <Text style={styles.rowLabel}>Findable by search</Text>
                <Toggle value={discoverable} onValueChange={toggleFindable} disabled={findablePending} />
              </View>
            </Card>
            <Text style={styles.footer}>Accepted friends only · a stat that isn't synced can't be shared.</Text>
          </View>

          <Text style={styles.footer}>
            Also on the server: pings you've sent friends and food-sighting history for favorite-food alerts -- not covered by these toggles yet.
          </Text>
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
  // Variant A spec: a SHARE row whose paired SYNC toggle is off dims to 0.38 opacity across the
  // whole row (label + sub-copy + toggle), not just the toggle itself.
  rowDisabled: { opacity: 0.38 },

  disclosureCard: {
    borderColor: withOpacity(colors.gold500, 45),
    padding: spacing(3.5),
    gap: spacing(2),
  },
  disclosureText: { fontFamily: fonts.body400, fontSize: fs(12), lineHeight: fs(16.8), color: colors.ink900 },
  disclosureDismiss: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600, alignSelf: "flex-end" },

  footer: { fontFamily: fonts.body400, fontSize: fs(11), lineHeight: fs(15.4), color: withOpacity(colors.ink900, 55) },
});
