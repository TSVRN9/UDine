import { computeDailyTotals, DINING_HALLS, favoriteKey, type Favorite, type LogEntry } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge, Card, Stat } from "../components/ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";
import { todayIso } from "../lib/date";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { signInWithGoogle, signOut } from "../lib/auth";
import { supabase } from "../lib/supabase";

const favoritesStorage = new SqliteFavoritesStorage();
const logStorage = new SqliteLogStorage();

const QUICK_LINKS: { href: string; label: string }[] = [
  { href: "/filters", label: "Dietary filters" },
  { href: "/friends", label: "Friends" },
  { href: "/notifications", label: "Notifications" },
  { href: "/events", label: "Events" },
  { href: "/press", label: "Press" },
  { href: "/newsletter", label: "Newsletter" },
];

export default function HomeScreen() {
  const [favoriteHallKeys, setFavoriteHallKeys] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const date = todayIso();

  const load = useCallback(() => {
    favoritesStorage.getFavorites().then((favs) => {
      setFavoriteHallKeys(new Set(favs.filter((f) => f.type === "location").map(favoriteKey)));
    });
    logStorage.getEntriesForDate(date).then(setEntries);
  }, [date]);

  useFocusEffect(load);

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getSession().then(({ data }) => setSession(data.session));
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
      return () => subscription.unsubscribe();
    }, []),
  );

  const totals = computeDailyTotals(date, entries);

  async function handleSignIn() {
    try {
      await signInWithGoogle();
    } catch (err) {
      Alert.alert("Sign-in failed", err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleHall(hallTid: number) {
    const favorite: Favorite = { type: "location", hallTid };
    const key = favoriteKey(favorite);
    if (favoriteHallKeys.has(key)) {
      await favoritesStorage.removeFavorite(favorite);
    } else {
      await favoritesStorage.addFavorite(favorite);
    }
    load();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.authRow}>
        {session ? (
          <>
            <Text style={styles.authText}>Signed in as {session.user.email}</Text>
            <Pressable onPress={() => signOut()}>
              <Text style={styles.authLink}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={handleSignIn}>
            <Text style={styles.authLink}>Sign in with Google</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.pageTitle}>Today</Text>
      <View style={styles.rule} />

      <Link href="/today" asChild>
        <Pressable>
          <Card style={styles.statsCard}>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Stat label="Calories" value={String(Math.round(totals.calories))} />
              </View>
              <View style={styles.statCell}>
                <Stat label="Protein" value={`${totals.proteinG.toFixed(1)}g`} />
              </View>
              <View style={styles.statCell}>
                <Stat label="Carbs" value={`${totals.totalCarbG.toFixed(1)}g`} />
              </View>
              <View style={styles.statCell}>
                <Stat label="Fat" value={`${totals.totalFatG.toFixed(1)}g`} />
              </View>
            </View>
            <Text style={styles.statsLink}>View full day &rarr;</Text>
          </Card>
        </Pressable>
      </Link>

      <Text style={styles.sectionTitle}>Dining halls</Text>
      <View style={styles.thinRule} />

      <View style={styles.hallList}>
        {DINING_HALLS.map((hall) => {
          const isFavorite = favoriteHallKeys.has(favoriteKey({ type: "location", hallTid: hall.tid }));
          return (
            <Card key={hall.slug} style={styles.hallRow}>
              <Pressable onPress={() => toggleHall(hall.tid)} hitSlop={8}>
                <Text style={[styles.star, isFavorite && styles.starActive]}>{isFavorite ? "★" : "☆"}</Text>
              </Pressable>
              <Link href={`/halls/${hall.slug}`} asChild>
                <Pressable style={styles.hallLink}>
                  <Text style={styles.hallName}>{hall.name}</Text>
                  {isFavorite && <Badge>Favorite</Badge>}
                </Pressable>
              </Link>
            </Card>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>More</Text>
      <View style={styles.thinRule} />
      <View style={styles.quickLinks}>
        <Link href="/rank" asChild>
          <Pressable style={styles.quickLink}>
            <Text style={styles.quickLinkText}>Rank dishes</Text>
          </Pressable>
        </Link>
        <Link href="/favorites" asChild>
          <Pressable style={styles.quickLink}>
            <Text style={styles.quickLinkText}>Favorites</Text>
          </Pressable>
        </Link>
        {QUICK_LINKS.map((link) => (
          <Link key={link.href} href={link.href as never} asChild>
            <Pressable style={styles.quickLink}>
              <Text style={styles.quickLinkText}>{link.label}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  authRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing(3) },
  authText: { color: withOpacity(colors.ink900, 60), fontFamily: fonts.body, fontSize: 13 },
  authLink: { color: colors.maroon600, fontFamily: fonts.body, fontWeight: "600", fontSize: 13 },
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  rule: { marginTop: spacing(2), height: 0, borderTopWidth: 4, borderBottomWidth: 1, borderColor: colors.gold500 },
  sectionTitle: {
    marginTop: spacing(6),
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  thinRule: { marginTop: spacing(1), height: 1, backgroundColor: withOpacity(colors.ink900, 25) },
  statsCard: { marginTop: spacing(4), padding: spacing(4) },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(4) },
  statCell: { minWidth: "40%", flexGrow: 1 },
  statsLink: { marginTop: spacing(3), color: colors.maroon600, fontFamily: fonts.body, fontWeight: "600", fontSize: 13 },
  hallList: { marginTop: spacing(3), gap: spacing(2) },
  hallRow: { flexDirection: "row", alignItems: "center", padding: spacing(3), gap: spacing(2) },
  hallLink: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(2) },
  hallName: { fontFamily: fonts.display, fontSize: 16, fontWeight: "700", textTransform: "uppercase", color: colors.maroon900 },
  star: { fontSize: 22, color: withOpacity(colors.ink900, 30) },
  starActive: { color: colors.gold500 },
  quickLinks: { marginTop: spacing(3), flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  quickLink: {
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    borderRadius: 2,
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(3),
  },
  quickLinkText: { color: colors.maroon600, fontFamily: fonts.body, fontWeight: "600", fontSize: 13 },
});
