import type { DiningEvent, TimeWindow } from "@udine/shared";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { HallHoursRow } from "../lib/hallMenuTabs";
import { hallInfoEventsEmptyCopy, hallInfoWindowText } from "../lib/hallMenuTabs";
import { useDraggableSheet } from "../lib/sheetAnimation";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  visible: boolean;
  hallName: string;
  address: string | null;
  directionsUrl: string | null;
  hoursRows: HallHoursRow[];
  grabNGoWindow: TimeWindow | null;
  events: DiningEvent[];
  onClose: () => void;
}

/**
 * Hall info bottom sheet -- address + DIRECTIONS, all serving windows with the current one
 * NOW-highlighted, Grab 'N Go hours, this hall's events. Same sheet shell as PlateSheet (drag
 * handle, dimmed backdrop, tap-to-dismiss scrim, transparent RN Modal).
 *
 * get_beacons_events carries no hall/location field, and expiration_date is an expiry, not a
 * start, so neither "this hall's events" nor "this week" is derivable from the feed. `events` here
 * is therefore the same unfiltered list passed to every hall's sheet -- `hallName` is used only in
 * the empty-state copy, not to filter.
 */
export function HallInfoSheet({ visible, hallName, address, directionsUrl, hoursRows, grabNGoWindow, events, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { gesture, backdropStyle, panelStyle, modalVisible } = useDraggableSheet(visible, onClose, fs(680));

  async function openDirections() {
    if (!directionsUrl) return;
    try {
      await Linking.openURL(directionsUrl);
    } catch (err) {
      Alert.alert("Couldn't open maps", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose}>
      {/* A root-level GestureHandlerRootView doesn't reliably propagate into a Modal's separate
      native host/window, so each sheet nests its own here. */}
      <GestureHandlerRootView style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[styles.sheet, panelStyle, { paddingBottom: spacing(6) + insets.bottom }]}>
          <GestureDetector gesture={gesture}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>

          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {hallName}
            </Text>
            <Text style={styles.titleCaption}>Dining Commons</Text>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Pressable style={styles.addressCard} onPress={openDirections} disabled={!directionsUrl} accessibilityRole="button" accessibilityLabel="Get directions">
              <View style={styles.addressText}>
                <Text style={styles.street}>{address ?? "Address unavailable"}</Text>
                <Text style={styles.campus}>UMass Amherst</Text>
              </View>
              {directionsUrl ? (
                <View style={styles.directions}>
                  <Text style={styles.directionsText}>DIRECTIONS</Text>
                  <Text style={styles.directionsGlyph}>↗</Text>
                </View>
              ) : null}
            </Pressable>

            <View style={styles.hoursCard}>
              {hoursRows.map((row, i) => (
                <View key={row.period}>
                  {i > 0 ? <View style={styles.rowDivider} /> : null}
                  <View style={[styles.hoursRow, row.isNow && styles.hoursRowNow]}>
                    <View style={styles.hoursRowLeft}>
                      <Text style={[styles.hoursLabel, row.isNow && styles.hoursLabelNow, !row.window && styles.hoursLabelAbsent]}>{row.label}</Text>
                      {row.isNow ? (
                        <View style={styles.nowPill}>
                          <Text style={styles.nowPillText}>NOW</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.hoursTime, row.isNow && styles.hoursTimeNow, !row.window && styles.hoursTimeAbsent]}>{hallInfoWindowText(row.window)}</Text>
                  </View>
                </View>
              ))}
              <View style={styles.rowDivider} />
              <View style={styles.hoursRow}>
                <View style={styles.hoursRowLeft}>
                  <Text style={styles.grabNGoGlyph}>◈</Text>
                  <Text style={styles.hoursLabel}>Grab &apos;N Go</Text>
                </View>
                <Text style={styles.hoursTime}>{hallInfoWindowText(grabNGoWindow)}</Text>
              </View>
            </View>

            {events.length === 0 ? (
              <View style={styles.eventsRow}>
                <Text style={styles.calendarGlyph}>▤</Text>
                <Text style={styles.eventsText}>{hallInfoEventsEmptyCopy(hallName)}</Text>
              </View>
            ) : (
              events.map((event, i) => (
                <View key={`${event.title}-${i}`} style={styles.eventsRow}>
                  <Text style={styles.calendarGlyph}>▤</Text>
                  <Text style={styles.eventsText}>{event.title}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: withOpacity(colors.ink900, 50) },
  sheet: {
    backgroundColor: colors.paper50,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: spacing(2.5),
    paddingHorizontal: spacing(5),
    gap: spacing(3),
    maxHeight: fs(680),
    // HallInfo.dc.html:30 -- box-shadow: 0 -8px 24px rgba(36,26,20,0.25)
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  // paddingVertical spacing(5) -- the bare 40x4 pill alone is too small a touch/drag target.
  handleRow: { alignItems: "center", paddingVertical: spacing(5) },
  handle: { width: fs(40), height: 4, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 20) },

  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing(2) },
  title: { flexShrink: 1, fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  titleCaption: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },

  scroll: { flexGrow: 0 },

  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(2),
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
    minHeight: 44,
    marginBottom: spacing(3),
  },
  addressText: { flexShrink: 1, gap: 1 },
  street: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.ink900 },
  campus: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
  directions: { flexDirection: "row", alignItems: "center", gap: spacing(1) },
  directionsText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600 },
  directionsGlyph: { fontSize: fs(12), color: colors.maroon600 },

  hoursCard: {
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    marginBottom: spacing(3),
    overflow: "hidden",
  },
  rowDivider: { height: 1, backgroundColor: withOpacity(colors.ink900, 8), marginHorizontal: spacing(3.5) },
  hoursRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing(2.25),
    paddingHorizontal: spacing(3.5),
  },
  hoursRowNow: { backgroundColor: "rgba(201,154,46,0.12)" },
  hoursRowLeft: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  hoursLabel: { fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.ink900, 70) },
  hoursLabelNow: { fontFamily: fonts.body600, color: colors.maroon900 },
  hoursLabelAbsent: { color: withOpacity(colors.ink900, 40) },
  hoursTime: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 70) },
  hoursTimeNow: { fontFamily: fonts.mono, fontWeight: "600", color: colors.maroon900 },
  hoursTimeAbsent: { color: withOpacity(colors.ink900, 40) },
  nowPill: { backgroundColor: colors.gold500, borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing(1.75) },
  nowPillText: { fontFamily: fonts.body600, fontSize: fs(9), fontWeight: "700", letterSpacing: 0.8, color: colors.maroon900 },
  grabNGoGlyph: { fontSize: fs(12), color: withOpacity(colors.ink900, 60) },

  eventsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2.5),
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
    minHeight: 44,
    marginBottom: spacing(2),
  },
  calendarGlyph: { fontSize: fs(14), color: colors.maroon600 },
  eventsText: { flexShrink: 1, fontFamily: fonts.body400, fontSize: fs(12), lineHeight: fs(17), color: withOpacity(colors.ink900, 70) },
});
