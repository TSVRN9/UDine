import { DINING_HALLS, hallNameFor } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useId, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, EmptyState } from "../components/ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";
import { sendPingGuarded } from "../lib/sendPing";
import { supabase } from "../lib/supabase";

type Profile = { user_id: string; display_name: string };
type Friendship = { user_a: string; user_b: string; status: "pending" | "accepted"; requested_by: string };
type Ping = { id: string; sender_id: string; receiver_id: string; hall_tid: number | null; message: string | null; created_at: string };

function otherUserId(f: Friendship, myId: string): string {
  return f.user_a === myId ? f.user_b : f.user_a;
}

/**
 * Friends screen content, extracted from the outer ScrollView so it can be mounted both as the
 * standalone `/friends` route (see FriendsScreen below) AND inside the Social pane's own single
 * ScrollView in the swipe shell (see app/index.tsx) without nesting two vertical ScrollViews.
 * #93 replaces the Social pane's internals; this stays the standalone route's content either way.
 */
export function FriendsBody() {
  const [session, setSession] = useState<Session | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());
  const [inbox, setInbox] = useState<Ping[]>([]);
  const [pingHallTid, setPingHallTid] = useState<Record<string, number | null>>({});
  const [pingMessage, setPingMessage] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    const myId = session?.user.id;
    if (!myId) return;

    const { data: fs } = await supabase.from("friendships").select("*").or(`user_a.eq.${myId},user_b.eq.${myId}`);
    setFriendships(fs ?? []);

    const otherIds = (fs ?? []).map((f) => otherUserId(f, myId));
    if (otherIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", otherIds);
      setProfilesById(new Map((profs ?? []).map((p) => [p.user_id, p])));
    }

    const { data: pings } = await supabase.from("pings").select("*").eq("receiver_id", myId).order("created_at", { ascending: false });
    setInbox(pings ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // #90: this now also mounts inside the Social pane alongside the standalone /friends route
  // (index route stays mounted under a pushed /friends, so both can be live at once) — a fixed
  // channel name would have the second instance's unsubscribe tear down the first's
  // subscription. useId() keeps each mounted instance on its own realtime topic.
  const instanceId = useId();
  useEffect(() => {
    const myId = session?.user.id;
    if (!myId) return;
    const channel = supabase
      .channel(`pings-inbox-${instanceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pings", filter: `receiver_id=eq.${myId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, refresh, instanceId]);

  async function search(text: string) {
    setQuery(text);
    const myId = session?.user.id;
    if (!myId || text.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase.from("profiles").select("user_id, display_name").ilike("display_name", `%${text}%`).neq("user_id", myId).limit(10);
    setSearchResults(data ?? []);
  }

  // Same supabase-js pitfall as sendPing below: {error} on RLS/PostgREST failure, not a throw.
  async function requestFriend(targetUserId: string) {
    const { error } = await supabase.rpc("request_friendship", { target_user_id: targetUserId });
    if (error) {
      Alert.alert("Couldn't send friend request", "Please try again.");
      return;
    }
    setSearchResults([]);
    setQuery("");
    refresh();
  }

  async function acceptFriend(f: Friendship) {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("user_a", f.user_a).eq("user_b", f.user_b);
    if (error) {
      Alert.alert("Couldn't accept friend request", "Please try again.");
      return;
    }
    refresh();
  }

  async function sendPing(otherId: string) {
    const myId = session?.user.id;
    if (!myId) return;
    const ok = await sendPingGuarded(supabase, { sender_id: myId, receiver_id: otherId, hall_tid: pingHallTid[otherId] ?? null, message: pingMessage[otherId] || null });
    if (ok) {
      setPingMessage((prev) => ({ ...prev, [otherId]: "" }));
    }
  }

  if (!session) {
    return <EmptyState title="Sign in required" message="Sign in to add friends and send pings." />;
  }

  const myId = session.user.id;
  const pending = friendships.filter((f) => f.status === "pending");
  const accepted = friendships.filter((f) => f.status === "accepted");

  return (
    <>
      <Text style={styles.pageTitle}>Friends</Text>
      <View style={styles.rule} />

      <Text style={styles.sectionTitle}>Find friends</Text>
      <View style={styles.thinRule} />
      <TextInput style={styles.input} value={query} onChangeText={search} placeholder="Search by name" />
      {searchResults.map((p) => (
        <Card key={p.user_id} style={styles.row}>
          <Text style={styles.rowText}>{p.display_name}</Text>
          <Pressable onPress={() => requestFriend(p.user_id)}>
            <Text style={styles.actionText}>Add friend</Text>
          </Pressable>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Friend requests</Text>
      <View style={styles.thinRule} />
      {pending.length === 0 && <Text style={styles.empty}>No pending requests.</Text>}
      {pending.map((f) => {
        const other = profilesById.get(otherUserId(f, myId));
        return (
          <Card key={f.user_a + f.user_b} style={styles.row}>
            <Text style={styles.rowText}>{other?.display_name ?? "..."}</Text>
            {f.requested_by === myId ? (
              <Text style={styles.pendingText}>pending</Text>
            ) : (
              <Pressable onPress={() => acceptFriend(f)}>
                <Text style={styles.actionText}>Accept</Text>
              </Pressable>
            )}
          </Card>
        );
      })}

      <Text style={styles.sectionTitle}>Your friends</Text>
      <View style={styles.thinRule} />
      {accepted.length === 0 && <Text style={styles.empty}>No friends yet.</Text>}
      {accepted.map((f) => {
        const otherId = otherUserId(f, myId);
        const other = profilesById.get(otherId);
        return (
          <Card key={f.user_a + f.user_b} style={styles.friendCard}>
            <Text style={styles.rowText}>{other?.display_name ?? "..."}</Text>
            <View style={styles.chipRow}>
              {DINING_HALLS.map((hall) => (
                <Pressable
                  key={hall.tid}
                  style={[styles.chip, pingHallTid[otherId] === hall.tid && styles.chipActive]}
                  onPress={() => setPingHallTid((prev) => ({ ...prev, [otherId]: prev[otherId] === hall.tid ? null : hall.tid }))}
                >
                  <Text style={[styles.chipText, pingHallTid[otherId] === hall.tid && styles.chipTextActive]}>{hall.name}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={pingMessage[otherId] ?? ""}
              onChangeText={(text) => setPingMessage((prev) => ({ ...prev, [otherId]: text }))}
              placeholder="message (optional)"
            />
            <Button variant="primary" onPress={() => sendPing(otherId)}>
              Ping "come eat with me"
            </Button>
          </Card>
        );
      })}

      <Text style={styles.sectionTitle}>Pings you've received</Text>
      <View style={styles.thinRule} />
      {inbox.length === 0 && <Text style={styles.empty}>No pings yet.</Text>}
      {inbox.map((p) => (
        <Text key={p.id} style={styles.pingRow}>
          {profilesById.get(p.sender_id)?.display_name ?? "Someone"} wants to eat {p.hall_tid ? `at ${hallNameFor(p.hall_tid)}` : ""}
          {p.message ? ` — "${p.message}"` : ""}
        </Text>
      ))}
    </>
  );
}

/** Standalone `/friends` route — thin ScrollView wrapper around FriendsBody. */
export default function FriendsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <FriendsBody />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  pageTitle: { fontFamily: fonts.display, fontSize: 24, fontWeight: "700", textTransform: "uppercase", color: colors.maroon900 },
  rule: { marginTop: spacing(2), marginBottom: spacing(2), height: 0, borderTopWidth: 4, borderBottomWidth: 1, borderColor: colors.gold500 },
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
  input: {
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 25),
    borderRadius: 2,
    padding: spacing(2.5),
    fontFamily: fonts.body,
    color: colors.ink900,
    backgroundColor: colors.paper50,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing(3), marginTop: spacing(2) },
  rowText: { fontSize: 15, fontFamily: fonts.body, color: colors.ink900 },
  actionText: { color: colors.maroon600, fontFamily: fonts.body, fontWeight: "600" },
  pendingText: { color: withOpacity(colors.ink900, 50), fontFamily: fonts.body },
  empty: { color: withOpacity(colors.ink900, 55), fontFamily: fonts.body, marginTop: spacing(1) },
  friendCard: { padding: spacing(3), marginTop: spacing(2), gap: spacing(2) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) },
  chip: { borderWidth: 1, borderColor: colors.maroon600, borderRadius: 999, paddingVertical: spacing(1), paddingHorizontal: spacing(2.5) },
  chipActive: { backgroundColor: colors.maroon600 },
  chipText: { color: colors.maroon600, fontFamily: fonts.body, fontSize: 13 },
  chipTextActive: { color: colors.paper50 },
  pingRow: { fontFamily: fonts.body, fontSize: 14, color: colors.ink900, paddingVertical: spacing(1.5) },
});
