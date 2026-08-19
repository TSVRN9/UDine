import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, radii, spacing, withOpacity } from "../../lib/theme";

/** Small uppercase chip for metadata (allergens, status, hall names). Mirrors .badge. */
export function Badge({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radii.sm,
    backgroundColor: withOpacity(colors.ink900, 8),
    paddingVertical: 1,
    paddingHorizontal: spacing(1.5),
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: withOpacity(colors.ink900, 70),
  },
});
