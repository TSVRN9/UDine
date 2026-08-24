import { hallNameFor, type Favorite } from "@udine/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Badge, Card, EmptyState } from "../components/ui";
import { colors, fonts, spacing } from "../lib/theme";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";

const storage = new SqliteFavoritesStorage();

export default function FavoritesScreen() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  useFocusEffect(
    useCallback(() => {
      storage.getFavorites().then(setFavorites);
    }, []),
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.container}
      data={favorites}
      keyExtractor={(f, i) => `${f.type}-${i}`}
      ListHeaderComponent={
        <View>
          <Text style={styles.pageTitle}>Favorites</Text>
          <View style={styles.rule} />
        </View>
      }
      renderItem={({ item }) => (
        <Card style={styles.row}>
          <Badge>{item.type === "dish" ? "Dish" : "Hall"}</Badge>
          <Text style={styles.rowText}>{item.type === "dish" ? item.dishName : hallNameFor(item.hallTid)}</Text>
        </Card>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={<EmptyState title="No favorites yet" message="Star a dish or dining hall to add one." />}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  pageTitle: { fontFamily: fonts.display, fontSize: 24, fontWeight: "700", textTransform: "uppercase", color: colors.maroon900 },
  rule: { marginTop: spacing(2), marginBottom: spacing(2), height: 0, borderTopWidth: 4, borderBottomWidth: 1, borderColor: colors.gold500 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing(3), gap: spacing(2.5) },
  rowText: { fontSize: 15, fontFamily: fonts.body, color: colors.ink900 },
  separator: { height: spacing(2) },
});
