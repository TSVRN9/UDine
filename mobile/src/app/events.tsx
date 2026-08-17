import { fetchEvents, type DiningEvent } from "@udine/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Linking, Pressable, StyleSheet, Text } from "react-native";

export default function EventsScreen() {
  const [items, setItems] = useState<DiningEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents().then(setItems).catch((e) => setError(String(e)));
  }, []);

  if (error) return <Text style={styles.error}>Failed to load events: {error}</Text>;
  if (!items) return <ActivityIndicator style={styles.container} />;

  function open(item: DiningEvent) {
    const url = item.externalLink || item.pdfLink;
    if (url) Linking.openURL(url);
  }

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(item, i) => `${item.title}-${i}`}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => open(item)}>
          {!!item.featuredImage && <Image source={{ uri: item.featuredImage }} style={styles.image} />}
          <Text style={styles.title}>
            {item.isFeatured ? "★ " : ""}
            {item.title}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No events right now.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  image: { width: "100%", height: 140, borderRadius: 6, marginBottom: 8, backgroundColor: "#eee" },
  title: { fontSize: 16, fontWeight: "600" },
  error: { padding: 16, color: "red" },
  empty: { padding: 16, color: "#666" },
});
