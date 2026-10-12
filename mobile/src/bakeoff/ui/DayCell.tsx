import { m2 } from "../../lib/theme";
import { DownChevron } from "./Chevron";
import type { Labels } from "./labels";
import { Press } from "./Press";
import { Text } from "./Text";

export function DayCell({ d }: { d: NonNullable<Labels["day"]> }) {
  return (
    <Press feedback="tint" tint="onDm" accessibilityRole="button" accessibilityLabel={d.accessibilityLabel} onPress={d.onPress}
      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: m2.space.action, paddingRight: m2.space.gutter, borderLeftWidth: 1, borderLeftColor: m2.color.divider }}>
      <Text v="day" color={m2.color.gold}>{d.label}</Text>
      <DownChevron />
    </Press>
  );
}
