import { fetchFaq, type FaqCategory } from "@udine/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, SectionList, StyleSheet, Text } from "react-native";

// FAQ content is trusted first-party UMass Dining copy (short paragraphs/links), not user input —
// stripping tags to plain text is enough here rather than pulling in an HTML-render dependency.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export default function FaqScreen() {
  const [categories, setCategories] = useState<FaqCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFaq().then(setCategories).catch((e) => setError(String(e)));
  }, []);

  if (error) return <Text style={styles.error}>Failed to load FAQ: {error}</Text>;
  if (!categories) return <ActivityIndicator style={styles.container} />;

  const sections = categories.map((c) => ({ title: c.name, data: c.items }));

  return (
    <SectionList
      style={styles.container}
      sections={sections}
      keyExtractor={(item, i) => `${item.title}-${i}`}
      renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
      renderItem={({ item }) => (
        <Text style={styles.item}>
          <Text style={styles.question}>{item.title}{"\n"}</Text>
          {stripHtml(item.content)}
        </Text>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No FAQ content right now.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: { fontSize: 16, fontWeight: "700", backgroundColor: "#eee", padding: 8 },
  item: { padding: 12, fontSize: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  question: { fontWeight: "600" },
  error: { padding: 16, color: "red" },
  empty: { padding: 16, color: "#666" },
});
