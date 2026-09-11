import { useLocalSearchParams } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "../components/ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { eventDateLine, type EventDetailParams } from "../lib/eventTapTarget";

/**
 * Pushed when an event card's tap target classifies as in-feed content (classifyEventTap,
 * eventTapTarget.ts) rather than an external link. The real get_beacons_events feed has no
 * separate body/description text, so the event's pdf_link poster graphic is the body.
 */
export default function EventDetailScreen() {
  // Typed against the same EventDetailParams the sender (openEventTap.ts) builds, so a renamed or
  // dropped key is a compile error here instead of a silently undefined field.
  const { title, featuredImage, pamphletImage, expirationDate, isFeatured } = useLocalSearchParams<EventDetailParams>();
  const subtitle = eventDateLine(expirationDate ?? "");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {featuredImage ? <Image source={{ uri: featuredImage }} style={styles.banner} resizeMode="cover" /> : null}
      <Card style={styles.card}>
        <Text style={styles.title}>
          {isFeatured === "1" ? "★ " : ""}
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.rule} />
        {pamphletImage ? <Image source={{ uri: pamphletImage }} style={styles.pamphlet} resizeMode="contain" /> : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  banner: { width: "100%", height: fs(180), borderRadius: radii.md, marginBottom: spacing(3), backgroundColor: withOpacity(colors.ink900, 8) },
  card: { padding: spacing(4) },
  title: { fontFamily: fonts.display700, fontSize: fs(20), color: colors.maroon900 },
  subtitle: { marginTop: spacing(1), fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.ink900, 65) },
  rule: { marginTop: spacing(2.5), marginBottom: spacing(3), height: 3, width: 72, backgroundColor: colors.gold500 },
  pamphlet: { width: "100%", height: fs(420), borderRadius: radii.sm, backgroundColor: withOpacity(colors.ink900, 6) },
});
