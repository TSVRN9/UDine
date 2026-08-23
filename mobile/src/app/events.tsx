import { fetchEvents, type DiningEvent } from "@udine/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Card, EmptyState } from "../components/ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";
import { openEventTap } from "../lib/openEventTap";

export default function EventsScreen() {
  const [items, setItems] = useState<DiningEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents().then(setItems).catch((e) => setError(String(e)));
  }, []);

  if (error) return <Text style={styles.error}>Failed to load events: {error}</Text>;
  if (!items) return <ActivityIndicator style={styles.loading} color={colors.maroon600} />;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.container}
      data={items}
      keyExtractor={(item, i) => `${item.title}-${i}`}
      renderItem={({ item }) => (
        // Same dispatcher as the Social pane's EventCard (../lib/openEventTap.ts) -- content
        // classifies to the in-app pamphlet, an external link to the pop-up in-app browser, a
        // malformed/missing payload safely no-ops. Was a hand-rolled `Linking.openURL(externalLink
        // || pdfLink)` with no scheme guard (PR #129 review, non-blocking finding) that kicked out
        // to the system browser instead of matching the Social pane's behavior for the same event.
        <Pressable onPress={() => openEventTap(item)} accessibilityRole="button" accessibilityLabel={item.title}>
          <Card style={styles.row}>
            {!!item.featuredImage && <Image source={{ uri: item.featuredImage }} style={styles.image} />}
            <Text style={styles.title}>
              {item.isFeatured ? "★ " : ""}
              {item.title}
            </Text>
          </Card>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={<EmptyState title="No events" message="No events right now." />}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  loading: { flex: 1, backgroundColor: colors.cream100 },
  row: { padding: spacing(3) },
  image: { width: "100%", height: 140, borderRadius: 6, marginBottom: spacing(2), backgroundColor: withOpacity(colors.ink900, 8) },
  title: { fontSize: 16, fontWeight: "700", fontFamily: fonts.display, color: colors.maroon900 },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body },
  separator: { height: spacing(2) },
});
