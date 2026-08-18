import { DINING_HALLS } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

type Profile = { user_id: string; display_name: string };
type Friendship = { user_a: string; user_b: string; status: "pending" | "accepted"; requested_by: string };
type Ping = { id: string; sender_id: string; receiver_id: string; hall_tid: number | null; message: string | null; created_at: string };

function hallName(hallTid: number | null): string {
  return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? "somewhere";
}

function otherUserId(f: Friendship, myId: string): string {
  return f.user_a === myId ? f.user_b : f.user_a;
}

export default function FriendsScreen() {
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

  useEffect(() => {
    const myId = session?.user.id;
    if (!myId) return;
    const channel = supabase
      .channel("pings-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pings", filter: `receiver_id=eq.${myId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, refresh]);

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

  async function requestFriend(targetUserId: string) {
    await supabase.rpc("request_friendship", { target_user_id: targetUserId });
    setSearchResults([]);
    setQuery("");
    refresh();
  }

  async function acceptFriend(f: Friendship) {
    await supabase.from("friendships").update({ status: "accepted" }).eq("user_a", f.user_a).eq("user_b", f.user_b);
    refresh();
  }

  async function sendPing(otherId: string) {
    const myId = session?.user.id;
    if (!myId) return;
    await supabase.from("pings").insert({ sender_id: myId, receiver_id: otherId, hall_tid: pingHallTid[otherId] ?? null, message: pingMessage[otherId] || null });
    setPingMessage((prev) => ({ ...prev, [otherId]: "" }));
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <Text>Sign in to add friends and send pings.</Text>
      </View>
    );
  }

  const myId = session.user.id;
  const pending = friendships.filter((f) => f.status === "pending");
  const accepted = friendships.filter((f) => f.status === "accepted");

  return (
    <ScrollView style={styles.container}>
      <View>
        <Text style={styles.sectionTitle}>Find friends</Text>
        <TextInput style={styles.input} value={query} onChangeText={search} placeholder="Search by name" />
        {searchResults.map((p) => (
          <View key={p.user_id} style={styles.row}>
            <Text style={styles.rowText}>{p.display_name}</Text>
            <Pressable onPress={() => requestFriend(p.user_id)}>
              <Text style={styles.actionText}>Add friend</Text>
            </Pressable>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Friend requests</Text>
        {pending.length === 0 && <Text style={styles.empty}>No pending requests.</Text>}
        {pending.map((f) => {
          const other = profilesById.get(otherUserId(f, myId));
          return (
            <View key={f.user_a + f.user_b} style={styles.row}>
              <Text style={styles.rowText}>{other?.display_name ?? "..."}</Text>
              {f.requested_by === myId ? (
                <Text style={styles.pendingText}>pending</Text>
              ) : (
                <Pressable onPress={() => acceptFriend(f)}>
                  <Text style={styles.actionText}>Accept</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Your friends</Text>
        {accepted.length === 0 && <Text style={styles.empty}>No friends yet.</Text>}
        {accepted.map((f) => {
          const otherId = otherUserId(f, myId);
          const other = profilesById.get(otherId);
          return (
            <View key={f.user_a + f.user_b} style={styles.friendCard}>
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
              <Pressable style={styles.pingButton} onPress={() => sendPing(otherId)}>
                <Text style={styles.pingButtonText}>Ping "come eat with me"</Text>
              </Pressable>
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Pings you've received</Text>
        {inbox.length === 0 && <Text style={styles.empty}>No pings yet.</Text>}
        {inbox.map((p) => (
          <Text key={p.id} style={styles.pingRow}>
            {profilesById.get(p.sender_id)?.display_name ?? "Someone"} wants to eat {p.hall_tid ? `at ${hallName(p.hall_tid)}` : ""}
            {p.message ? ` — "${p.message}"` : ""}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginTop: 20, marginBottom: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: "#ccc", borderRadius: 8, padding: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#eee" },
  rowText: { fontSize: 16 },
  actionText: { color: "#208AEF", fontWeight: "600" },
  pendingText: { color: "#888" },
  empty: { color: "#888" },
  friendCard: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#eee" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 6 },
  chip: { borderWidth: 1, borderColor: "#208AEF", borderRadius: 16, paddingVertical: 4, paddingHorizontal: 10 },
  chipActive: { backgroundColor: "#208AEF" },
  chipText: { color: "#208AEF" },
  chipTextActive: { color: "white" },
  pingButton: { backgroundColor: "#208AEF", borderRadius: 8, padding: 10, alignItems: "center", marginTop: 4 },
  pingButtonText: { color: "white", fontWeight: "600" },
  pingRow: { paddingVertical: 6 },
});
