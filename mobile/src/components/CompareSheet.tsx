import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hallNameFor } from "@udine/shared";
import type { CompareCard } from "../lib/compare";
import { useDraggableSheet } from "../lib/sheetAnimation";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  visible: boolean;
  /** Kept by the caller through the close animation, so the sheet never blanks mid-slide. */
  pair: [CompareCard, CompareCard] | null;
  onPick: (winner: CompareCard, loser: CompareCard) => void;
  onSkip: () => void;
  onClose: () => void;
}

/**
 * "Which did you like more?" (CompareSheet.dc.html) -- the head-to-head sheet. Same shell as
 * HallInfoSheet/FilterSheet (transparent RN Modal, drag handle, tap-to-dismiss scrim) and the same
 * PlateExpanded.dc.html look. Picking, skipping and what follows are the caller's: this only reports.
 */
export function CompareSheet({ visible, pair, onPick, onSkip, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { gesture, backdropStyle, panelStyle, modalVisible } = useDraggableSheet(visible, onClose, fs(400));
  if (!pair) return null;
  const [a, b] = pair;
  // A tap landing during the close tween (the sheet is still mounted) must not count as a second pick.
  const guard = (fn: () => void) => () => {
    if (visible) fn();
  };
  const card = (dish: CompareCard, other: CompareCard) => (
    <Pressable style={styles.card} onPress={guard(() => onPick(dish, other))} accessibilityRole="button">
      <Text style={styles.name}>{dish.dishName}</Text>
      <Text style={styles.sub}>{`${hallNameFor(dish.hallTid)} · ${dish.calories} cal`}</Text>
    </Pressable>
  );

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose}>
      {/* A root-level GestureHandlerRootView doesn't reliably propagate into a Modal's separate
      native host/window, so each sheet nests its own here (same as HallInfoSheet). */}
      <GestureHandlerRootView style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View testID="compareSheetPanel" style={[styles.sheet, panelStyle, { paddingBottom: spacing(6) + insets.bottom }]}>
          <GestureDetector gesture={gesture}>
            <View style={styles.handleRow}>
              <View testID="compareHandle" style={styles.handle} />
            </View>
          </GestureDetector>
          <Text style={styles.title}>Which did you like more?</Text>
          <View style={styles.cards}>
            {card(a, b)}
            <View style={styles.divider}>
              <View testID="compareRule" style={styles.rule} />
              <Text style={styles.or}>or</Text>
              <View testID="compareRule" style={styles.rule} />
            </View>
            {card(b, a)}
          </View>
          <Pressable style={styles.skip} onPress={guard(onSkip)} accessibilityRole="button">
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
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
    // The artboard's uniform 14px panel gap (handle, title, cards, Skip).
    gap: spacing(3.5),
    // CompareSheet.dc.html -- box-shadow: 0 -8px 24px rgba(36,26,20,0.25)
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  // Same enlarged touch target as PlateSheet's handle row: the bare 40x4 pill is too small to drag.
  // The panel gap above supplies the artboard's 14px to the title.
  handleRow: { alignItems: "center", paddingVertical: spacing(5) },
  handle: { width: fs(40), height: 4, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 20) },
  title: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  cards: { gap: spacing(2) },
  card: {
    minHeight: 68,
    justifyContent: "center",
    gap: 1,
    backgroundColor: colors.paper50,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
  },
  name: { fontFamily: fonts.body600, fontSize: fs(15), color: colors.ink900 },
  sub: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 60) },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing(2.5) },
  rule: { height: 1, flexGrow: 1, backgroundColor: withOpacity(colors.ink900, 12) },
  or: { fontFamily: fonts.body600, fontSize: fs(10), letterSpacing: 1, textTransform: "uppercase", color: withOpacity(colors.ink900, 55) },
  skip: { height: 44, alignItems: "center", justifyContent: "center" },
  skipText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon600 },
});
