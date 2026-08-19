import { DINING_HALLS, syncFavoritedFoods, type Favorite } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { EmptyState } from "../components/ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";
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
      <View style={styles.screen}>
        <EmptyState title="Sign in required" message="Sign in to enable favorited-food alerts." />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.pageTitle}>Notifications</Text>
      <View style={styles.rule} />

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Notify me when a favorited dish shows up on the menu</Text>
        <Switch value={notificationsEnabled} onValueChange={toggleNotifications} trackColor={{ true: colors.maroon600 }} />
      </View>
      <Text style={styles.hint}>Turning this on will request notification permission and register your device for push. This is always the notification feed either way.</Text>

      <Text style={styles.sectionTitle}>Sightings</Text>
      <View style={styles.thinRule} />
      {sightings.length === 0 ? (
        <EmptyState title="No sightings yet" message="No favorited-food sightings yet." />
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
  screen: { flex: 1, backgroundColor: colors.cream100 },
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  pageTitle: { fontFamily: fonts.display, fontSize: 24, fontWeight: "700", textTransform: "uppercase", color: colors.maroon900 },
  rule: { marginTop: spacing(2), marginBottom: spacing(4), height: 0, borderTopWidth: 4, borderBottomWidth: 1, borderColor: colors.gold500 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(3) },
  toggleLabel: { flex: 1, fontSize: 15, fontFamily: fonts.body, color: colors.ink900 },
  hint: { color: withOpacity(colors.ink900, 55), fontSize: 12, fontFamily: fonts.body, marginTop: spacing(2) },
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
  sightingRow: { paddingVertical: spacing(2), borderBottomWidth: StyleSheet.hairlineWidth, borderColor: withOpacity(colors.ink900, 15) },
  sightingRead: { opacity: 0.6 },
  sightingText: { fontSize: 15, fontFamily: fonts.body, color: colors.ink900 },
  sightingDish: { fontWeight: "700", color: colors.maroon900 },
});
