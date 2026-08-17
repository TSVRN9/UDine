import { DINING_HALLS, favoriteKey, type Favorite } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { Link } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { signInWithGoogle, signOut } from "../lib/auth";
import { supabase } from "../lib/supabase";

const favoritesStorage = new SqliteFavoritesStorage();

export default function HallListScreen() {
  const [favoriteHallKeys, setFavoriteHallKeys] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<Session | null>(null);

  const load = useCallback(() => {
    favoritesStorage.getFavorites().then((favs) => {
      setFavoriteHallKeys(new Set(favs.filter((f) => f.type === "location").map(favoriteKey)));
    });
  }, []);

  useFocusEffect(load);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

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
    <View style={styles.container}>
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
      <FlatList
        data={DINING_HALLS}
        keyExtractor={(hall) => hall.slug}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Link href={`/halls/${item.slug}`} asChild>
              <Pressable style={styles.rowLink}>
                <Text style={styles.rowText}>{item.name}</Text>
              </Pressable>
            </Link>
            <Pressable onPress={() => toggleHall(item.tid)} hitSlop={8}>
              <Text style={styles.star}>{favoriteHallKeys.has(favoriteKey({ type: "location", hallTid: item.tid })) ? "★" : "☆"}</Text>
            </Pressable>
          </View>
        )}
      />
      <View style={styles.navGrid}>
        <NavButton href="/today" label="Today's macros" />
        <NavButton href="/favorites" label="Favorites" />
        <NavButton href="/filters" label="Dietary filters" />
        <NavButton href="/rank" label="Rank dishes" />
        <NavButton href="/events" label="Events" />
        <NavButton href="/press" label="Press" />
        <NavButton href="/faq" label="FAQ" />
      </View>
    </View>
  );
}

function NavButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href as never} asChild>
      <Pressable style={styles.navButton}>
        <Text style={styles.navButtonText}>{label}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  authRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  authText: { color: "#555" },
  authLink: { color: "#208AEF", fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  rowLink: { flex: 1, paddingVertical: 16 },
  rowText: { fontSize: 18 },
  star: { fontSize: 22, color: "#e0a800", paddingHorizontal: 8 },
  navGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  navButton: { flexGrow: 1, minWidth: "30%", padding: 12, backgroundColor: "#208AEF", borderRadius: 8, alignItems: "center" },
  navButtonText: { color: "white", fontWeight: "600" },
});
