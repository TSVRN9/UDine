import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radii, spacing, withOpacity } from "../lib/theme";
import { paneDots } from "../lib/paneShell";

/** Pane header per the canvas: condensed title (UDINE / SOCIAL / YOU) with the position dots
 * inline to the right — the active pane's dot is larger and maroon, no rule underneath. Shared by
 * every pane (Social/Home/You) — moved out of app/index.tsx by #92 so a non-route file (panes/) can
 * import it without depending on a route file (see #92's PR description for why). */
export function PaneHeader({ title, activeIndex }: { title: string; activeIndex: number }) {
  return (
    <View style={styles.paneHeaderRow}>
      <Text style={styles.pageTitle}>{title}</Text>
      <View style={styles.dotsRow}>
        {paneDots(activeIndex).map((active, i) => (
          <View key={i} style={active ? styles.dotActive : styles.dot} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paneHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pageTitle: {
    fontFamily: fonts.display700,
    fontSize: 20,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  dotsRow: { flexDirection: "row", gap: spacing(1.5), alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 25) },
  dotActive: { width: 8, height: 8, borderRadius: radii.pill, backgroundColor: colors.maroon600 },
});
