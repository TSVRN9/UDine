import { hallNameFor } from "@udine/shared";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { EmptyState } from "../components/ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";
import { useFavoriteFoodAlerts } from "../lib/favoriteFoodAlerts";
import { supabase } from "../lib/supabase";

type Sighting = { id: string; dish_name: string; hall_tid: number; sighted_date: string; read_at: string | null; created_at: string };

/**
 * Notifications screen content, extracted from the outer ScrollView so it can be mounted both as
 * the standalone `/notifications` route (see NotificationsScreen below) AND inside the Social
 * pane's own single ScrollView in the swipe shell (see app/index.tsx) without nesting two
 * vertical ScrollViews. #93 replaces the Social pane's internals; this stays the standalone
 * route's content either way.
 *
 * #182: the toggle itself (session, notifications_enabled read/write, favorited_foods sync,
 * push-token lifecycle) now lives in useFavoriteFoodAlerts so the You pane's "Your data" screen
 * can render the identical toggle -- this component only owns the sightings feed and its own copy.
 */
export function NotificationsBody() {
  const { session, notificationsEnabled, needsPermission, toggle } = useFavoriteFoodAlerts();
  const [sightings, setSightings] = useState<Sighting[]>([]);

  const refreshSightings = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from("food_sightings").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
    setSightings(data ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      refreshSightings();
    }, [refreshSightings]),
  );

  async function toggleNotifications(next: boolean) {
    const { error } = await toggle(next);
    if (error) Alert.alert("Couldn't update notifications", "Please try again.");
  }

  async function markRead(sighting: Sighting) {
    if (sighting.read_at) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("food_sightings").update({ read_at: readAt }).eq("id", sighting.id);
    if (error) {
      Alert.alert("Couldn't mark as read", "Please try again.");
      return;
    }
    setSightings((prev) => prev.map((s) => (s.id === sighting.id ? { ...s, read_at: readAt } : s)));
  }

  if (!session) {
    return <EmptyState title="Sign in required" message="Sign in to enable favorited-food alerts." />;
  }

  return (
    <>
      <Text style={styles.pageTitle}>Notifications</Text>
      <View style={styles.rule} />

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Notify me when a favorited dish shows up on the menu</Text>
        {/* PR #286 review (Part B): same needs-action rendering as privacy.tsx's alerts toggle --
            notifications_enabled defaulting true (#248) can be true server-side with no OS
            permission granted yet, so this must not show ON until it actually is. */}
        <Switch value={notificationsEnabled && !needsPermission} onValueChange={toggleNotifications} trackColor={{ true: colors.maroon600 }} />
      </View>
      <Text style={styles.hint}>
        {notificationsEnabled && needsPermission
          ? "Tap to finish turning on -- allow notifications when asked."
          : "Turning this on will request notification permission and register your device for push. This is always the notification feed either way."}
      </Text>

      <Text style={styles.sectionTitle}>Sightings</Text>
      <View style={styles.thinRule} />
      {sightings.length === 0 ? (
        <EmptyState title="No sightings yet" message="No favorited-food sightings yet." />
      ) : (
        sightings.map((s) => (
          <Pressable key={s.id} onPress={() => markRead(s)} style={[styles.sightingRow, s.read_at ? styles.sightingRead : null]} accessibilityRole="button">
            <Text style={styles.sightingText}>
              <Text style={styles.sightingDish}>{s.dish_name}</Text> at {hallNameFor(s.hall_tid)} on {s.sighted_date}
            </Text>
          </Pressable>
        ))
      )}
    </>
  );
}

export default function NotificationsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <NotificationsBody />
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
