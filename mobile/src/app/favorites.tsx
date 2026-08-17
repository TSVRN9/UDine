import { DINING_HALLS, type Favorite } from "@udine/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
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
      style={styles.container}
      data={favorites}
      keyExtractor={(f, i) => `${f.type}-${i}`}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.badge}>{item.type === "dish" ? "Dish" : "Hall"}</Text>
          <Text style={styles.rowText}>{item.type === "dish" ? item.dishName : DINING_HALLS.find((h) => h.tid === item.hallTid)?.name ?? item.hallTid}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No favorites yet — star a dish or dining hall to add one.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  badge: { fontSize: 11, fontWeight: "700", color: "#208AEF", borderWidth: 1, borderColor: "#208AEF", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  rowText: { fontSize: 16 },
  empty: { padding: 16, color: "#666" },
});
