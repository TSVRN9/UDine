import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, fs, spacing, withOpacity } from "../../lib/theme";

/**
 * Canvas section header: condensed uppercase label with the gold rule filling the rest of the row.
 * Every artboard section (PING A FRIEND, ENTRÉES, HALL COMPLETION, …) uses this exact pattern.
 */
export function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing(2.5) },
  title: {
    fontFamily: fonts.display600,
    fontSize: fs(13),
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  rule: { height: 2, flexGrow: 1, backgroundColor: withOpacity(colors.gold500, 50) },
});
