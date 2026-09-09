import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, fs, withOpacity } from "../../lib/theme";

/**
 * Canvas section header: condensed uppercase label with the gold rule filling the rest of the row.
 * Every artboard section (PING A FRIEND, ENTRÉES, HALL COMPLETION, …) uses this exact pattern.
 * `right` is an optional accessory after the rule (e.g. You pane's ALL LOGS link, #118) -- omitted
 * by every other call site, so this is purely additive.
 */
export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.rule} />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  // Literal 10px, not spacing(2.5) -- the canvas's 10px gap isn't a multiple of the 4px step.
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: {
    fontFamily: fonts.display600,
    fontSize: fs(13),
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  rule: { height: 2, flexGrow: 1, backgroundColor: withOpacity(colors.gold500, 50) },
});
