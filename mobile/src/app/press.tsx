import { fetchPressReleases, type PressRelease } from "@udine/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Linking, Pressable, StyleSheet, Text } from "react-native";

export default function PressScreen() {
  const [items, setItems] = useState<PressRelease[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPressReleases().then(setItems).catch((e) => setError(String(e)));
  }, []);

  if (error) return <Text style={styles.error}>Failed to load press releases: {error}</Text>;
  if (!items) return <ActivityIndicator style={styles.container} />;

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(item, i) => `${item.url}-${i}`}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => Linking.openURL(item.url)}>
          {!!item.image && <Image source={{ uri: item.image }} style={styles.image} />}
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.date}>{item.date}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No press releases right now.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  image: { width: "100%", height: 140, borderRadius: 6, marginBottom: 8, backgroundColor: "#eee" },
  title: { fontSize: 16, fontWeight: "600" },
  date: { fontSize: 13, color: "#666", marginTop: 4 },
  error: { padding: 16, color: "red" },
  empty: { padding: 16, color: "#666" },
});
