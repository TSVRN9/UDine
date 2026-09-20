import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, fs, withOpacity } from "../../lib/theme";

/**
 * Canvas section header: condensed uppercase label with the gold rule filling the rest of the row.
 * Every artboard section (PING A FRIEND, ENTRÉES, HALL COMPLETION, …) uses this exact pattern.
 * `right` is an optional accessory after the rule (e.g. You pane's ALL LOGS link, #118) -- omitted
 * by every other call site, so this is purely additive.
 *
 * `variant="subtle"` (#418) is a second, lighter treatment YouPaneGrouped.dc.html specifies for
 * three of its sub-headers (Favorites/Your Top Foods/Favorite Halls): 12px/1.2-letterspacing title
 * with a 1px ink hairline rule instead of the 13px/1.5/gold default. Defaults to "default" so every
 * existing call site (including "Today's Log", which keeps the gold rule) is unaffected.
 */
export function SectionHeader({
  title,
  right,
  variant = "default",
  growRule = false,
}: {
  title: string;
  right?: ReactNode;
  variant?: "default" | "subtle";
  /** A subtle header with a `right` accessory keeps a fixed 20px rule (Favorites); this lets the rule fill the row instead (Your Top Foods' Rate more, YouTopFoodsRankMore.dc.html). */
  growRule?: boolean;
}) {
  const isSubtle = variant === "subtle";
  const titleStyle = isSubtle ? styles.titleSubtle : styles.title;

  // Favorites (#418) is the only subtle header with a `right` accessory, and its rule is a fixed
  // 20px width per YouPaneGrouped.dc.html:78 (not flex-grow like every other header) -- so title
  // and rule are grouped together and `right` is pushed to the row's far edge with
  // justify-content instead of relying on the rule's flexGrow to consume the remaining space.
  if (isSubtle && right && !growRule) {
    return (
      <View style={[styles.row, styles.rowSpaceBetween, styles.rowBaseline]}>
        <View style={styles.row}>
          <Text style={titleStyle}>{title}</Text>
          <View style={styles.ruleSubtleFixed} />
        </View>
        {right}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={titleStyle}>{title}</Text>
      <View style={isSubtle ? styles.ruleSubtle : styles.rule} />
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
  rowSpaceBetween: { justifyContent: "space-between" },
  // Favorites (#437): YouPaneGrouped.dc.html's Favorites row uses align-items: baseline, not the
  // default row's "center" -- distinguishes it from Today's Log's header row.
  rowBaseline: { alignItems: "baseline" },
  titleSubtle: {
    fontFamily: fonts.display600,
    fontSize: fs(12),
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  // Flex-grow ink hairline (Your Top Foods/Favorite Halls).
  ruleSubtle: { height: 1, flexGrow: 1, backgroundColor: withOpacity(colors.ink900, 12) },
  // Fixed-width ink hairline (Favorites only -- see the isSubtle && right branch above).
  ruleSubtleFixed: { height: 1, width: 20, backgroundColor: withOpacity(colors.ink900, 12) },
});
