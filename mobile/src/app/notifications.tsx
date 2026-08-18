import { DINING_HALLS, syncFavoritedFoods, type Favorite } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { supabase } from "../lib/supabase";

const PLATFORM = "expo" as const;

/** Requests permission and returns an Expo push token, or null if denied/unavailable (e.g. no FCM creds yet). */
async function registerForPushToken(): Promise<string | null> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== "granted") {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (e) {
    // FCM credentials may not be uploaded to EAS yet — don't block the in-app feature on it.
    console.warn("[push] getExpoPushTokenAsync failed (FCM V1 creds may not be uploaded to EAS)", e);
    return null;
  }
}

type Sighting = { id: string; dish_name: string; hall_tid: number; sighted_date: string; read_at: string | null; created_at: string };

const favoritesStorage = new SqliteFavoritesStorage();

function hallName(hallTid: number): string {
  return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? `Hall ${hallTid}`;
}

export default function NotificationsScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [sightings, setSightings] = useState<Sighting[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data: profile } = await supabase.from("profiles").select("notifications_enabled").eq("user_id", session.user.id).single();
    setNotificationsEnabled(profile?.notifications_enabled ?? false);

    const { data } = await supabase.from("food_sightings").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
    setSightings(data ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function toggleNotifications(next: boolean) {
    if (!session) return;
    await supabase.from("profiles").update({ notifications_enabled: next }).eq("user_id", session.user.id);
    setNotificationsEnabled(next);

    // Sync (or clear) favorited_foods to match — see CLAUDE.md: favorited_foods only syncs when
    // signed in AND notifications_enabled.
    const favorites: Favorite[] = next ? await favoritesStorage.getFavorites() : [];
    await syncFavoritedFoods(supabase, session.user.id, favorites);

    if (next) {
      // Best-effort: permission may be denied, or getExpoPushTokenAsync may fail if FCM creds
      // aren't uploaded to EAS yet. Either way, in-app notifications_enabled above still stands.
      const token = await registerForPushToken();
      if (token) {
        await supabase.from("push_tokens").upsert({ user_id: session.user.id, platform: PLATFORM, token });
      }
    } else {
      await supabase.from("push_tokens").delete().eq("user_id", session.user.id).eq("platform", PLATFORM);
    }
  }

  async function markRead(sighting: Sighting) {
    if (sighting.read_at) return;
    const readAt = new Date().toISOString();
    await supabase.from("food_sightings").update({ read_at: readAt }).eq("id", sighting.id);
    setSightings((prev) => prev.map((s) => (s.id === sighting.id ? { ...s, read_at: readAt } : s)));
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <Text>Sign in to enable favorited-food alerts.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Notify me when a favorited dish shows up on the menu</Text>
        <Switch value={notificationsEnabled} onValueChange={toggleNotifications} />
      </View>
      <Text style={styles.hint}>Push delivery isn&apos;t wired up yet — this is the notification feed for now. See CLAUDE.md.</Text>

      <Text style={styles.sectionTitle}>Sightings</Text>
      {sightings.length === 0 ? (
        <Text style={styles.empty}>No favorited-food sightings yet.</Text>
      ) : (
        sightings.map((s) => (
          <Pressable key={s.id} onPress={() => markRead(s)} style={[styles.sightingRow, s.read_at ? styles.sightingRead : null]}>
            <Text style={styles.sightingText}>
              <Text style={styles.sightingDish}>{s.dish_name}</Text> at {hallName(s.hall_tid)} on {s.sighted_date}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  toggleLabel: { flex: 1, fontSize: 16 },
  hint: { color: "#888", fontSize: 12, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginTop: 20, marginBottom: 8 },
  empty: { color: "#888" },
  sightingRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#eee" },
  sightingRead: { opacity: 0.6 },
  sightingText: { fontSize: 16 },
  sightingDish: { fontWeight: "600" },
});
