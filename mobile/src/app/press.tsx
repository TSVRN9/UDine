import { fetchPressReleases, type PressRelease } from "@udine/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Card, EmptyState } from "../components/ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";

export default function PressScreen() {
  const [items, setItems] = useState<PressRelease[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPressReleases().then(setItems).catch((e) => setError(String(e)));
  }, []);

  if (error) return <Text style={styles.error}>Failed to load press releases: {error}</Text>;
  if (!items) return <ActivityIndicator style={styles.loading} color={colors.maroon600} />;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.container}
      data={items}
      keyExtractor={(item, i) => `${item.url}-${i}`}
      renderItem={({ item }) => (
        <Pressable onPress={() => Linking.openURL(item.url)}>
          <Card style={styles.row}>
            {!!item.image && <Image source={{ uri: item.image }} style={styles.image} />}
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.date}>{item.date}</Text>
          </Card>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={<EmptyState title="No press releases" message="No press releases right now." />}
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
  date: { fontSize: 13, fontFamily: fonts.mono, color: withOpacity(colors.ink900, 55), marginTop: spacing(1) },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body },
  separator: { height: spacing(2) },
});
