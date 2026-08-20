import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radii, spacing, withOpacity } from "../lib/theme";
import { paneDots } from "../lib/paneShell";

/** Pane header: title + position dots, per #90 ("position dots in each pane's header"). Shared by
 * every pane (Social/Home/You) — moved out of app/index.tsx by #92 so a non-route file (panes/) can
 * import it without depending on a route file (see #92's PR description for why). */
export function PaneHeader({ title, activeIndex }: { title: string; activeIndex: number }) {
  return (
    <View>
      <View style={styles.paneHeaderRow}>
        <Text style={styles.pageTitle}>{title}</Text>
        <View style={styles.dotsRow}>
          {paneDots(activeIndex).map((active, i) => (
            <View key={i} style={[styles.dot, active && styles.dotActive]} />
          ))}
        </View>
      </View>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  paneHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  dotsRow: { flexDirection: "row", gap: spacing(1) },
  dot: { width: 6, height: 6, borderRadius: radii.pill, backgroundColor: withOpacity(colors.maroon900, 25) },
  dotActive: { backgroundColor: colors.maroon900 },
  rule: { marginTop: spacing(2), marginBottom: spacing(3), height: 0, borderTopWidth: 4, borderBottomWidth: 1, borderColor: colors.gold500 },
});
