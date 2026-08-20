import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, withOpacity } from "../../lib/theme";

/** Label-over-number block, mono numerals — canvas macro-summary register (You / plate sheet). */
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
    fontFamily: fonts.body600,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: withOpacity(colors.ink900, 55),
    marginBottom: 2,
  },
  value: {
    fontFamily: fonts.mono,
    fontSize: 19,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    lineHeight: 24,
    color: colors.maroon900,
  },
  caption: {
    marginTop: 2,
    fontFamily: fonts.body400,
    fontSize: 12,
    color: withOpacity(colors.ink900, 50),
  },
});
