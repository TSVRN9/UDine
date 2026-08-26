import type { Session } from "@supabase/supabase-js";
import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../components/ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { addButtonLabel, avatarFillFor, initialsOf, otherUserId, resultButtonState, sentAgoText, type FriendshipRow } from "../lib/addFriends";
import { supabase } from "../lib/supabase";

type Profile = { user_id: string; display_name: string; email: string | null };

/** Section header pattern for this screen: Oswald 600 13px ls1.5 uppercase ink + gold rule, plus
 * an optional trailing count badge (REQUESTS FOR YOU carries one, RESULTS/SENT don't). */
function AddFriendsSectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      <View style={styles.sectionHeaderRule} />
      {count !== undefined && count > 0 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** "Findable by search" toggle -- exact track/knob geometry from the #182 spec this issue points
 * at (44x26 track, 22px knob, maroon-when-on). No Animated timing -- a static transform is enough
 * for correctness; the artboard's 180ms transitions are a visual nicety, not tested behavior. */
function FindableToggle({ on, onChange, disabled }: { on: boolean; onChange: (next: boolean) => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={() => onChange(!on)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel="Findable by search"
      style={[styles.toggleTrack, { backgroundColor: on ? colors.maroon600 : withOpacity(colors.ink900, 15) }]}
    >
      <View style={[styles.toggleKnob, on ? { alignSelf: "flex-end" } : { alignSelf: "flex-start", borderWidth: 1, borderColor: withOpacity(colors.ink900, 15) }]} />
    </Pressable>
  );
}

/**
 * #184: the Add Friends screen -- search + results (ADD/REQUESTED), incoming requests
 * (accept/decline), sent requests (cancel), the dark "Add in person" entry row (-> /add-friend-qr),
 * and the "Findable by search" toggle. Reached from Social's + avatar and You's Friends row (both
 * now point here instead of the older combined /friends screen, which keeps its own
 * accepted-friends-ping-composer and pings-inbox content -- neither is part of this artboard).
 *
 * Only origin = 'search' friendships rows are shown here -- the in-person QR flow's pending rows
 * never sit in an inbox (both-confirm, see /add-friend-qr + /qr-confirm), so they're deliberately
 * excluded from RESULTS/REQUESTS FOR YOU/SENT.
 */
export default function AddFriendsScreen() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [myDiscoverable, setMyDiscoverable] = useState(true);
  const [togglePending, setTogglePending] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());

  const refresh = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const myId = sessionData.session?.user.id;
    setSession(sessionData.session);
    if (!myId) return;

    const { data: myProfile } = await supabase.from("profiles").select("discoverable").eq("user_id", myId).maybeSingle();
    setMyDiscoverable(myProfile?.discoverable ?? true);

    const { data: rows } = await supabase.from("friendships").select("*").or(`user_a.eq.${myId},user_b.eq.${myId}`);
    const searchRows = ((rows ?? []) as FriendshipRow[]).filter((r) => r.origin === "search");
    setFriendships(searchRows);

    const otherIds = searchRows.map((r) => otherUserId(r, myId));
    if (otherIds.length > 0) {
      // related_profiles (#227), not a raw .select("...email") -- profiles.email is no longer
      // table-wide SELECT-granted (see 20260825120000_lockdown_profile_search.sql), so a direct
      // select of it would just fail. This RPC is scoped to self + an existing friendships row
      // (any status) -- exactly the ids this screen ever asks for here.
      const { data: profs } = await supabase.rpc("related_profiles", { target_ids: otherIds });
      setProfilesById(new Map((profs ?? []).map((p: Profile) => [p.user_id, p])));
    } else {
      setProfilesById(new Map());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function search(text: string) {
    setQuery(text);
    const myId = session?.user.id;
    if (!myId || text.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    const term = text.trim();
    // search_profiles RPC (#227), not a raw .ilike() straight at the table -- profiles.email is no
    // longer table-wide SELECT-granted (see 20260825120000_lockdown_profile_search.sql), a raw
    // select of it would just fail, and a raw table select could never enforce a minimum term
    // length or row cap the way this RPC does server-side. Still exactly one parameter, still no
    // .or() -- the comma-injection concern from #210 doesn't apply here either (the raw term is
    // passed as an ordinary RPC argument, never interpolated into a filter-expression string).
    const { data } = await supabase.rpc("search_profiles", { term });
    const merged = new Map<string, Profile>();
    for (const p of (data ?? []) as Profile[]) merged.set(p.user_id, p);
    setSearchResults(Array.from(merged.values()).slice(0, 20));
  }

  async function requestFriend(targetId: string) {
    const { error } = await supabase.rpc("request_friendship", { target_user_id: targetId });
    if (error) {
      Alert.alert("Couldn't send request", error.message ?? "Try again.");
      return;
    }
    refresh();
  }

  async function acceptFriend(f: FriendshipRow) {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("user_a", f.user_a).eq("user_b", f.user_b);
    if (error) {
      Alert.alert("Couldn't accept request", "Please try again.");
      return;
    }
    refresh();
  }

  async function declineOrCancel(f: FriendshipRow) {
    const { error } = await supabase.from("friendships").delete().eq("user_a", f.user_a).eq("user_b", f.user_b);
    if (error) {
      Alert.alert("Couldn't remove this request", "Please try again.");
      return;
    }
    refresh();
  }

  async function toggleFindable(next: boolean) {
    const myId = session?.user.id;
    if (!myId) return;
    setTogglePending(true);
    const { error } = await supabase.from("profiles").update({ discoverable: next }).eq("user_id", myId);
    setTogglePending(false);
    if (error) {
      Alert.alert("Couldn't update this setting", "Please try again.");
      return;
    }
    setMyDiscoverable(next);
  }

  // #283 review: this header (back chevron + title) used to only be drawn in the signed-in
  // return below. Since #281 removed the native Stack header this screen used to fall back on,
  // the signed-out branch is now the only affordance a signed-out user has to leave this screen
  // -- and YouPane's "Friends" row reaches here without gating on session, so signed-out is a
  // real, reachable path, not a hypothetical. Hoisted above both returns so neither branch is
  // ever header-less.
  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backChevron}>‹</Text>
      </Pressable>
      <Text style={styles.headerTitle}>Add friends</Text>
    </View>
  );

  if (!session) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing(4.5) }]}>
        {header}
        <EmptyState title="Sign in required" message="Sign in to add friends." />
      </View>
    );
  }

  const myId = session.user.id;
  const requestsForYou = friendships.filter((f) => f.status === "pending" && f.requested_by !== myId);
  const sent = friendships.filter((f) => f.status === "pending" && f.requested_by === myId);
  const existingByOtherId = new Map(friendships.map((f) => [otherUserId(f, myId), f]));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(4.5) }]}>
      {header}

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.searchWrap}>
          <View style={styles.searchField}>
            <Text style={styles.searchGlyph}>⌕</Text>
            <TextInput style={styles.searchInput} value={query} onChangeText={search} placeholder="Search by name or email" placeholderTextColor={withOpacity(colors.ink900, 45)} />
          </View>
          <Text style={styles.searchHelper}>Search by name or @umass.edu email. Only UMass accounts can join.</Text>
        </View>

        <Link href="/add-friend-qr" asChild>
          <Pressable style={styles.qrRow} accessibilityRole="button" accessibilityLabel="Add in person">
            <Text style={styles.qrGlyph}>▦</Text>
            <View style={styles.qrRowText}>
              <Text style={styles.qrRowTitle}>Add in person</Text>
              <Text style={styles.qrRowSubtitle}>Show or scan a code — always works, even with search off.</Text>
            </View>
            <Text style={styles.qrRowChevron}>›</Text>
          </Pressable>
        </Link>

        {/* Not in the artboard spec -- added because both entry points that used to reach
            /friends (SocialPane's + avatar, YouPane's Friends row) now land here instead, and
            /friends is still the only screen that shows received pings ("come eat with me") and
            its realtime inbox. Smallest honest fix per the review: keep it one tap away rather
            than fold pings-inbox UI into this screen (which the artboard doesn't spec at all). */}
        <Link href="/friends" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Friends and pings you've received">
            <Text style={styles.pingsInboxLink}>Friends & pings you&apos;ve received →</Text>
          </Pressable>
        </Link>

        {query.trim().length > 0 && (
          <View style={styles.section}>
            <AddFriendsSectionHeader title="Results" />
            {searchResults.length === 0 ? (
              <Text style={styles.emptyText}>No one found.</Text>
            ) : (
              searchResults.map((p, i) => {
                const state = resultButtonState(existingByOtherId.get(p.user_id));
                return (
                  <View key={p.user_id} style={styles.resultRow}>
                    <View style={[styles.avatar, { backgroundColor: avatarFillFor(i) }]}>
                      <Text style={styles.avatarText}>{initialsOf(p.display_name)}</Text>
                    </View>
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName}>{p.display_name}</Text>
                      <Text style={styles.resultEmail}>{p.email ?? ""}</Text>
                    </View>
                    {state === "add" ? (
                      <Pressable style={styles.addButton} onPress={() => requestFriend(p.user_id)} accessibilityRole="button" accessibilityLabel={addButtonLabel(p.display_name)}>
                        <Text style={styles.addButtonText}>+ ADD</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.requestedButton}>
                        <Text style={styles.requestedButtonText}>✓ REQUESTED</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={styles.section}>
          <AddFriendsSectionHeader title="Requests for you" count={requestsForYou.length} />
          {requestsForYou.length === 0 ? (
            <Text style={styles.emptyText}>No pending requests.</Text>
          ) : (
            requestsForYou.map((f, i) => {
              const other = profilesById.get(otherUserId(f, myId));
              return (
                <View key={f.user_a + f.user_b} style={styles.incomingRow}>
                  <View style={[styles.avatar, { backgroundColor: avatarFillFor(i) }]}>
                    <Text style={styles.avatarText}>{initialsOf(other?.display_name ?? "?")}</Text>
                  </View>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{other?.display_name ?? "..."}</Text>
                    <Text style={styles.resultEmail}>{other?.email ?? ""}</Text>
                  </View>
                  <Pressable style={styles.acceptButton} onPress={() => acceptFriend(f)} accessibilityRole="button" accessibilityLabel="Accept">
                    <Text style={styles.acceptButtonText}>✓</Text>
                  </Pressable>
                  <Pressable style={styles.declineButton} onPress={() => declineOrCancel(f)} accessibilityRole="button" accessibilityLabel="Decline">
                    <Text style={styles.declineButtonText}>✕</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <AddFriendsSectionHeader title="Sent" />
          {sent.length === 0 ? (
            <Text style={styles.emptyText}>No requests sent.</Text>
          ) : (
            sent.map((f, i) => {
              const other = profilesById.get(otherUserId(f, myId));
              return (
                <View key={f.user_a + f.user_b} style={styles.resultRow}>
                  <View style={[styles.avatar, { backgroundColor: avatarFillFor(i) }]}>
                    <Text style={styles.avatarText}>{initialsOf(other?.display_name ?? "?")}</Text>
                  </View>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{other?.display_name ?? "..."}</Text>
                    <Text style={styles.sentSubline}>{sentAgoText(f.created_at ?? new Date().toISOString())}</Text>
                  </View>
                  <Pressable onPress={() => declineOrCancel(f)} accessibilityRole="button" accessibilityLabel="Cancel">
                    <Text style={styles.cancelText}>CANCEL</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing(4) }]}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleLabel}>Findable by search</Text>
            <Text style={styles.toggleSubline}>Off = no one can find or request you here. Your in-person code still works.</Text>
          </View>
          <FindableToggle on={myDiscoverable} onChange={toggleFindable} disabled={togglePending} />
        </View>
        <Text style={styles.footnote}>ⓘ Friends see only what you share in Your Data — nothing is shared until you turn a stat on.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100, paddingHorizontal: spacing(5) },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingBottom: spacing(3.5) },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(28), lineHeight: fs(28), color: colors.maroon900 },
  headerTitle: { fontFamily: fonts.display700, fontSize: fs(22), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },

  scrollContent: { gap: spacing(3.5), paddingBottom: spacing(8) },

  searchWrap: { gap: spacing(1.5) },
  searchField: { flexDirection: "row", alignItems: "center", gap: spacing(2), height: fs(48), backgroundColor: colors.paper50, borderWidth: 1, borderColor: withOpacity(colors.ink900, 25), borderRadius: radii.md, paddingHorizontal: spacing(3.5) },
  searchGlyph: { fontSize: fs(16), color: withOpacity(colors.ink900, 50) },
  searchInput: { flex: 1, fontFamily: fonts.body400, fontSize: fs(14), color: colors.ink900, height: fs(48) },
  searchHelper: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
  pingsInboxLink: { fontFamily: fonts.body600, fontSize: fs(12), color: colors.maroon600, textAlign: "center" },

  qrRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), minHeight: fs(44), backgroundColor: colors.maroon900, borderRadius: radii.md, paddingVertical: spacing(3), paddingHorizontal: spacing(3.5) },
  qrGlyph: { fontSize: fs(22), color: colors.gold500 },
  qrRowText: { flex: 1, gap: 2 },
  qrRowTitle: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.paper50 },
  qrRowSubtitle: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.paper50, 65) },
  qrRowChevron: { fontFamily: fonts.body400, fontSize: fs(18), color: colors.gold500 },

  section: { gap: spacing(2.5) },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  sectionHeaderTitle: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 1.5, textTransform: "uppercase", color: colors.maroon900 },
  sectionHeaderRule: { height: 2, flexGrow: 1, backgroundColor: withOpacity(colors.gold500, 50) },
  countBadge: { minWidth: fs(20), height: fs(20), borderRadius: radii.pill, backgroundColor: colors.gold500, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing(1) },
  countBadgeText: { fontFamily: fonts.mono, fontSize: fs(12), fontWeight: "600", color: colors.maroon900 },

  emptyText: { fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.ink900, 55) },

  avatar: { width: fs(44), height: fs(44), borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.display600, fontSize: fs(16), color: colors.paper50 },

  resultRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), backgroundColor: colors.paper50, borderWidth: 1, borderColor: withOpacity(colors.ink900, 12), borderRadius: radii.md, paddingVertical: spacing(2.5), paddingHorizontal: spacing(3.5) },
  resultInfo: { flex: 1, gap: 1 },
  resultName: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  resultEmail: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },

  addButton: { height: fs(44), paddingHorizontal: spacing(4.5), borderRadius: radii.md, backgroundColor: colors.maroon600, alignItems: "center", justifyContent: "center" },
  addButtonText: { fontFamily: fonts.body600, fontSize: fs(12), letterSpacing: 0.5, color: colors.paper50 },
  requestedButton: { height: fs(44), paddingHorizontal: spacing(4.5), borderRadius: radii.md, borderWidth: 1, borderColor: withOpacity(colors.ink900, 20), alignItems: "center", justifyContent: "center" },
  requestedButtonText: { fontFamily: fonts.body600, fontSize: fs(12), letterSpacing: 0.5, color: withOpacity(colors.ink900, 50) },

  incomingRow: { flexDirection: "row", alignItems: "center", gap: spacing(2.5), backgroundColor: colors.paper50, borderWidth: 1, borderColor: colors.gold500, borderRadius: radii.md, paddingVertical: spacing(2.5), paddingHorizontal: spacing(3.5) },
  acceptButton: { width: fs(44), height: fs(44), borderRadius: radii.pill, backgroundColor: colors.maroon600, alignItems: "center", justifyContent: "center" },
  acceptButtonText: { fontFamily: fonts.body600, fontSize: fs(16), color: colors.paper50 },
  declineButton: { width: fs(44), height: fs(44), borderRadius: radii.pill, borderWidth: 1, borderColor: withOpacity(colors.ink900, 20), alignItems: "center", justifyContent: "center" },
  declineButtonText: { fontFamily: fonts.body600, fontSize: fs(16), color: withOpacity(colors.ink900, 55) },

  sentSubline: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  cancelText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600, minHeight: fs(44), textAlignVertical: "center" },

  bottomBar: { marginTop: "auto", gap: spacing(2), paddingTop: spacing(3) },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  toggleTextWrap: { flex: 1, gap: 2 },
  toggleLabel: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  toggleSubline: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
  footnote: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },

  // padding scales with spacing() (same width-proportional factor as fs()) -- a bare `2` here
  // would stay fixed while the track/knob shrink at narrow widths (320dp), eventually leaving the
  // knob no room and visibly overflowing the track.
  toggleTrack: { width: fs(44), height: fs(26), borderRadius: radii.pill, padding: spacing(0.5), justifyContent: "center" },
  toggleKnob: { width: fs(22), height: fs(22), borderRadius: radii.pill, backgroundColor: colors.paper50 },
});
