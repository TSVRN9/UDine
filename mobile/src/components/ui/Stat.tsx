import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, withOpacity } from "../../lib/theme";

/** Label-over-number block, mono numerals (nutrition-label register). Mirrors .stat. */
export function Stat({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: withOpacity(colors.ink900, 60),
  },
  value: {
    fontFamily: fonts.mono,
    fontSize: 28,
    fontVariant: ["tabular-nums"],
    lineHeight: 32,
    color: colors.maroon900,
  },
  caption: {
    marginTop: 2,
    fontSize: 12,
    color: withOpacity(colors.ink900, 50),
  },
});
