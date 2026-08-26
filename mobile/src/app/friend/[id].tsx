import { hallNameFor } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../../lib/theme";
import { pillTone } from "../../lib/youPaneFormat";
import { supabase } from "../../lib/supabase";

type Profile = { user_id: string; display_name: string };
type Friendship = { user_a: string; user_b: string; created_at: string };
type SharedCompletion = { hallTid: number; loggedDistinct: number; seenDistinct: number };
type SharedTopFood = { dishName: string; score: number; hallName: string | null };
type SharedHallRank = { hallTid: number; rank: number };
type SharedStatsRow = { completion: unknown; top_foods: unknown; hall_ranks: unknown } | null;

/** #271: a top_foods array entry with a non-numeric score still crashes TopFoodRow's
 * `f.score.toFixed(1)` even when the outer field is a genuine array -- the server's check
 * constraint can't reach into array elements, so a bad entry is dropped here rather than
 * rendered. Degrades the same way a genuinely empty (opted-in, nothing-yet) array does. */
function isValidTopFood(f: unknown): f is SharedTopFood {
  return !!f && typeof (f as SharedTopFood).score === "number" && Number.isFinite((f as SharedTopFood).score);
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function friendsSinceText(createdAt: string): string {
  return `Friends since ${new Date(createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
}

/** Small paper card, matching the FriendProfile artboard's stat-card chrome. */
function StatCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.statCard}>{children}</View>;
}

/** The honest "opted-out" state -- rendered instead of a stat's card whenever that field is null,
 * per #94's own spec ("each un-shared stat renders an honest 'Casey doesn't share this' state"). */
function NotSharedNote({ name }: { name: string }) {
  return (
    <StatCard>
      <Text style={styles.notSharedText}>{name} doesn&apos;t share this.</Text>
    </StatCard>
  );
}

function CompletionRow({ c }: { c: SharedCompletion }) {
  const pct = c.seenDistinct === 0 ? 0 : Math.floor((100 * c.loggedDistinct) / c.seenDistinct);
  return (
    <View style={styles.completionRow}>
      <View style={styles.completionHeader}>
        <Text style={styles.completionHall}>{hallNameFor(c.hallTid)}</Text>
        <Text style={styles.completionCounts}>
          {pct}% · {c.loggedDistinct} of {c.seenDistinct} dishes
        </Text>
      </View>
      <View style={styles.completionTrack}>
        <View style={[styles.completionFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function TopFoodRow({ f, maxScore }: { f: SharedTopFood; maxScore: number }) {
  const tone = pillTone(f.score, maxScore);
  return (
    <View style={styles.topFoodRow}>
      <View style={styles.topFoodInfo}>
        <Text style={styles.topFoodName}>{f.dishName}</Text>
        {f.hallName ? <Text style={styles.topFoodHall}>{f.hallName}</Text> : null}
      </View>
      <View style={[styles.scorePill, tone === "gold" ? styles.scorePillGold : styles.scorePillMaroon]}>
        <Text style={[styles.scorePillText, tone === "gold" ? styles.scorePillTextGold : styles.scorePillTextMaroon]}>{f.score.toFixed(1)}</Text>
      </View>
    </View>
  );
}

/**
 * #94: tap a friend's avatar (Social pane) -> their shared stats, per the "Friend profile (tap
 * avatar)" canvas artboard. Each of the three privacy-gated stats renders its opted-in data, or an
 * honest "doesn't share this" note -- never a fabricated/guessed value. The artboard's placeholder
 * subtitle ("41 meals logged") isn't backed by any real opt-in stat (the consumption log itself is
 * always device-only, see CLAUDE.md's residency table) so it's replaced here with the one honest,
 * real thing available: how long the friendship's existed (friendships.created_at).
 */
export default function FriendProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [stats, setStats] = useState<SharedStatsRow>(null);

  const refresh = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const myId = sessionData.session?.user.id;
    setSession(sessionData.session);
    if (!myId || !id) return;

    // Canonical order, same as friendships' own PK -- fetches exactly the one pair instead of
    // every friendship the caller has. Filtered to status = 'accepted' at the query level: a
    // pending (not-yet-mutual) request must never render "Friends since" as if it were fact
    // (review finding #4) -- shared_stats' own RLS already hid the *stats* from a pending
    // connection, but this screen was independently asserting friendship as true from unfiltered
    // data.
    const a = myId < id ? myId : id;
    const b = myId < id ? id : myId;

    const [{ data: prof }, { data: friendshipRow }, { data: sharedStats }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").eq("user_id", id).maybeSingle(),
      supabase.from("friendships").select("user_a, user_b, created_at").eq("user_a", a).eq("user_b", b).eq("status", "accepted").maybeSingle(),
      supabase.from("shared_stats").select("completion, top_foods, hall_ranks").eq("user_id", id).maybeSingle(),
    ]);

    setProfile(prof ?? null);
    setFriendship(friendshipRow ?? null);
    setStats(sharedStats ?? null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function sendPing() {
    const myId = session?.user.id;
    if (!myId || !id) return;
    // supabase-js resolves { error } on an RLS/PostgREST failure rather than rejecting -- this
    // screen is reachable for any user id (deep link, or a friendship that later lapses), and the
    // pings insert policy requires an accepted friendship, so a discarded error here used to alert
    // a confirmed "sent" for a ping that never existed (review finding #2).
    const { error } = await supabase.from("pings").insert({ sender_id: myId, receiver_id: id, message: null, hall_tid: null });
    if (error) {
      Alert.alert("Couldn't send ping", "You may not be friends with this person (yet).");
      return;
    }
    Alert.alert("Ping sent", `${profile?.display_name ?? "They"}'ll see it in their pings.`);
  }

  const name = profile?.display_name ?? "…";
  // #271: the server's check constraint only guarantees SQL NULL or a JSON array -- an accepted
  // friend can still write any other shape via a raw PostgREST upsert (owner RLS allows it). A
  // malformed non-array field renders the same "doesn't share this" state as an absent field,
  // never throws. isValidTopFood additionally guards each *entry* (a non-numeric score crashes
  // TopFoodRow's `.toFixed` even when the outer array shape is fine).
  const completion = Array.isArray(stats?.completion) ? (stats.completion as SharedCompletion[]) : null;
  const hallRanks = Array.isArray(stats?.hall_ranks) ? (stats.hall_ranks as SharedHallRank[]) : null;
  const topFoods = Array.isArray(stats?.top_foods) ? (stats.top_foods as unknown[]).filter(isValidTopFood) : null;
  const maxScore = topFoods && topFoods.length > 0 ? Math.max(...topFoods.map((f) => f.score)) : 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing(4.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>{initialsOf(name)}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerName}>{name}</Text>
            {friendship ? <Text style={styles.headerSubtitle}>{friendsSinceText(friendship.created_at)}</Text> : null}
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hall Completion</Text>
          {completion ? (
            <StatCard>
              {completion.map((c) => (
                <CompletionRow key={c.hallTid} c={c} />
              ))}
            </StatCard>
          ) : (
            <NotSharedNote name={name} />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Foods</Text>
          {topFoods === null ? (
            // Not opted in -- absent (SQL NULL), the honest "doesn't share this" state.
            <NotSharedNote name={name} />
          ) : topFoods.length > 0 ? (
            <View style={styles.rowList}>
              {topFoods.map((f) => (
                <TopFoodRow key={f.dishName} f={f} maxScore={maxScore} />
              ))}
            </View>
          ) : (
            // Opted in, but nothing qualifies yet -- an empty array is NOT the same as "doesn't
            // share this" (review finding #5): the friend chose to share, there's just nothing to
            // show yet. Rendering NotSharedNote here would be a false statement about their choice.
            <StatCard>
              <Text style={styles.notSharedText}>{name} hasn&apos;t rated enough foods yet.</Text>
            </StatCard>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Their Hall Ranking</Text>
          {hallRanks ? (
            <StatCard>
              {hallRanks.map((r) => (
                <View key={r.hallTid} style={styles.rankRow}>
                  <Text style={[styles.rankNumber, r.rank === 1 && styles.rankNumberTop]}>{r.rank}</Text>
                  <Text style={styles.rankHallName}>{hallNameFor(r.hallTid)}</Text>
                </View>
              ))}
            </StatCard>
          ) : (
            <NotSharedNote name={name} />
          )}
        </View>
      </ScrollView>

      <View style={styles.pingBar}>
        <Pressable onPress={sendPing} style={styles.pingButton}>
          <Text style={styles.pingButtonText}>Ping {name}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  header: { backgroundColor: colors.maroon900, paddingHorizontal: spacing(5), paddingBottom: spacing(5), gap: spacing(3.5) },
  backChevron: { fontFamily: fonts.body600, fontSize: fs(28), color: colors.paper50, lineHeight: fs(28) },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing(4) },
  avatarCircle: {
    width: fs(64),
    height: fs(64),
    borderRadius: radii.pill,
    backgroundColor: colors.maroon600,
    borderWidth: 2,
    borderColor: colors.gold500,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontFamily: fonts.display600, fontSize: fs(22), color: colors.paper50 },
  headerText: { gap: 2 },
  headerName: { fontFamily: fonts.display700, fontSize: fs(24), letterSpacing: 0.5, color: colors.paper50 },
  headerSubtitle: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.paper50, 60) },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing(5), paddingTop: spacing(4), paddingBottom: spacing(10), gap: spacing(3.5) },
  section: { gap: spacing(2) },
  sectionTitle: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 1.5, textTransform: "uppercase", color: colors.maroon900 },

  statCard: { backgroundColor: colors.paper50, borderWidth: 1, borderColor: withOpacity(colors.ink900, 12), borderRadius: radii.md, padding: spacing(3.5), gap: spacing(2.5) },
  notSharedText: { fontFamily: fonts.body400, fontStyle: "italic", fontSize: fs(13), color: withOpacity(colors.ink900, 55) },

  completionRow: { gap: spacing(1) },
  completionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing(2) },
  completionHall: { fontFamily: fonts.body600, fontSize: fs(12), color: colors.ink900 },
  completionCounts: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 70) },
  completionTrack: { height: 6, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 10), overflow: "hidden" },
  completionFill: { height: "100%", borderRadius: radii.pill, backgroundColor: colors.gold500 },

  rowList: { gap: spacing(2) },
  topFoodRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing(2),
    backgroundColor: colors.paper50,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
  },
  topFoodInfo: { flex: 1, gap: 1 },
  topFoodName: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  topFoodHall: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  scorePill: { minWidth: fs(44), alignItems: "center", borderRadius: radii.pill, paddingVertical: spacing(1.25) },
  scorePillGold: { backgroundColor: colors.gold500 },
  scorePillMaroon: { backgroundColor: colors.maroon600 },
  scorePillText: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600" },
  scorePillTextGold: { color: colors.maroon900 },
  scorePillTextMaroon: { color: colors.paper50 },

  rankRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(2), borderBottomWidth: 1, borderColor: withOpacity(colors.ink900, 8) },
  rankNumber: { fontFamily: fonts.display700, fontSize: fs(16), color: withOpacity(colors.ink900, 40), minWidth: fs(16) },
  rankNumberTop: { color: colors.gold500 },
  rankHallName: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },

  pingBar: { paddingHorizontal: spacing(5), paddingVertical: spacing(4) },
  pingButton: { backgroundColor: colors.maroon600, borderRadius: radii.md, height: fs(52), alignItems: "center", justifyContent: "center" },
  pingButtonText: { fontFamily: fonts.display600, fontSize: fs(16), letterSpacing: 0.5, textTransform: "uppercase", color: colors.paper50 },
});
