import { fetchNewsletter, type NewsletterIssue } from "@udine/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text } from "react-native";

export default function NewsletterScreen() {
  const [issues, setIssues] = useState<NewsletterIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNewsletter().then(setIssues).catch((e) => setError(String(e)));
  }, []);

  if (error) return <Text style={styles.error}>Failed to load newsletter: {error}</Text>;
  if (!issues) return <ActivityIndicator style={styles.container} />;

  return (
    <FlatList
      style={styles.container}
      data={issues}
      keyExtractor={(item, i) => `${item.link}-${i}`}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => Linking.openURL(item.link)}>
          <Text style={styles.period}>{item.period}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No newsletter issues right now.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  period: { fontSize: 16, fontWeight: "600" },
  error: { padding: 16, color: "red" },
  empty: { padding: 16, color: "#666" },
});
