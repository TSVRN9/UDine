import * as FileSystem from "expo-file-system/legacy";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { buttonColors, colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { eventDateLine, type EventDetailParams } from "../lib/eventTapTarget";

const shareColors = buttonColors("secondary");

/**
 * Pushed when an event card's tap target classifies as in-feed content (classifyEventTap,
 * eventTapTarget.ts) rather than an external link. The real get_beacons_events feed has no
 * separate body/description text, so the event's pdf_link poster graphic is the body.
 *
 * Draws its own in-content header (headerShown: false in _layout.tsx) instead of the native stack
 * header, same convention as export.tsx/NutritionLabel.tsx -- per EventDetailOptionA.dc.html.
 */
export default function EventDetailScreen() {
  // Typed against the same EventDetailParams the sender (openEventTap.ts) builds, so a renamed or
  // dropped key is a compile error here instead of a silently undefined field.
  const { title, featuredImage, pamphletImage, expirationDate, isFeatured } = useLocalSearchParams<EventDetailParams>();
  const subtitle = eventDateLine(expirationDate ?? "");
  const insets = useSafeAreaInsets();

  async function handleShare() {
    try {
      // RN's Share can't send image bytes (and Android drops `url`), so the poster goes as a file.
      const isPng = /\.png$/i.test(pamphletImage.split(/[?#]/)[0]);
      const dest = `${FileSystem.cacheDirectory}event-poster-${Date.now()}.${isPng ? "png" : "jpg"}`;
      const result = await FileSystem.downloadAsync(pamphletImage, dest);
      // downloadAsync resolves on a non-2xx response too (error page bytes, not a rejection).
      if (result.status < 200 || result.status >= 300) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, isPng ? { mimeType: "image/png", UTI: "public.png" } : { mimeType: "image/jpeg", UTI: "public.jpeg" });
      }
    } catch {
      // A failed download or share isn't something the user needs an alert to go fix.
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing(4.5) }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Event</Text>
        </View>
        <Pressable style={styles.sharePill} onPress={handleShare} accessibilityRole="button" accessibilityLabel="Share">
          {/* Upload/arrow-out-of-box glyph, path values read off EventDetailOptionA.dc.html --
          unlike the back chevron, no existing text glyph reads as "share". */}
          <Svg width={fs(13)} height={fs(13)} viewBox="0 0 16 16" fill="none">
            <Path d="M8 1.5v8" stroke={shareColors.color} strokeWidth={1.6} strokeLinecap="round" />
            <Path d="M5 4.5L8 1.5l3 3" stroke={shareColors.color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M4 7.5v5.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7.5" stroke={shareColors.color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={styles.sharePillText}>SHARE</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {featuredImage ? <Image source={{ uri: featuredImage }} style={styles.banner} resizeMode="cover" /> : null}
        <View style={styles.content}>
          <Text style={styles.title}>
            {isFeatured === "1" ? "★ " : ""}
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.rule} />
          {pamphletImage ? <Image source={{ uri: pamphletImage }} style={styles.pamphlet} resizeMode="contain" /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(3),
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(3.5),
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing(3), minWidth: 0 },
  backChevron: { fontFamily: fonts.body600, fontSize: fs(28), color: colors.maroon900, lineHeight: fs(28) },
  headerTitle: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  sharePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    height: fs(32),
    paddingHorizontal: spacing(3.5),
    borderWidth: 1,
    borderRadius: radii.pill,
    backgroundColor: shareColors.backgroundColor,
    borderColor: shareColors.borderColor,
    flexShrink: 0,
  },
  sharePillText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: shareColors.color },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing(10) },
  // Full-bleed, no radius, no side margin -- directly below the header, per the artboard.
  banner: { width: "100%", height: fs(180), backgroundColor: withOpacity(colors.ink900, 8) },
  content: { paddingVertical: spacing(5), paddingHorizontal: spacing(5.5) },
  title: { fontFamily: fonts.display700, fontSize: fs(22), color: colors.maroon900 },
  subtitle: { marginTop: spacing(2.5), fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.ink900, 65) },
  rule: { marginTop: spacing(3.5), marginBottom: spacing(4), height: 3, width: 72, backgroundColor: colors.gold500 },
  pamphlet: { width: "100%", height: fs(420), borderRadius: radii.md, backgroundColor: withOpacity(colors.ink900, 6) },
});
