import { fetchStaff, type StaffMember } from "@udine/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Linking, Pressable, StyleSheet, Text } from "react-native";

// Bio is trusted first-party UMass Dining copy (short paragraphs), not user input — stripping tags
// to plain text is enough here rather than pulling in an HTML-render dependency. Same approach as
// faq.tsx's stripHtml.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export default function StaffScreen() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStaff().then(setStaff).catch((e) => setError(String(e)));
  }, []);

  if (error) return <Text style={styles.error}>Failed to load staff directory: {error}</Text>;
  if (!staff) return <ActivityIndicator style={styles.container} />;

  return (
    <FlatList
      style={styles.container}
      data={staff}
      keyExtractor={(item, i) => `${item.email || item.name}-${i}`}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => item.email && Linking.openURL(`mailto:${item.email}`)}>
          {!!item.profileImage && <Image source={{ uri: item.profileImage }} style={styles.image} />}
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.title}>
            {item.title}
            {item.department ? ` · ${item.department}` : ""}
          </Text>
          {!!item.bio && <Text style={styles.bio}>{stripHtml(item.bio)}</Text>}
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No staff listed right now.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  image: { width: 64, height: 64, borderRadius: 32, marginBottom: 8, backgroundColor: "#eee" },
  name: { fontSize: 16, fontWeight: "600" },
  title: { fontSize: 13, color: "#666", marginTop: 2 },
  bio: { fontSize: 14, marginTop: 6 },
  error: { padding: 16, color: "red" },
  empty: { padding: 16, color: "#666" },
});
