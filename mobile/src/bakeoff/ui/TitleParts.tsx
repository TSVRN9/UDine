import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { DownChevron } from "./Chevron";
import type { Labels } from "./labels";
import { Press } from "./Press";
import { Text } from "./Text";

// M2 `#mts` pads its line 12 above and below (and 16 to the right); a line of status text is shorter than a touch target, so the slop is what
// brings the button to `tap` without moving the line
const slop = Math.ceil((m2.size.tap - m2.type.status.line) / 2);
const STATUS_SLOP = { top: slop, bottom: slop, right: m2.space.action };

export function TitleParts({ l }: { l: Labels }) {
  return (
    <>
      <View style={{ minHeight: m2.type.status.line, marginTop: 7 }}>
        {l.status ? (
          <Press accessibilityRole="button" accessibilityLabel={`${l.status}, hours and directions`} onPress={l.onStatus} disabled={!l.onStatus}
            hitSlop={STATUS_SLOP} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text v="status" color={m2.color.onDmSoft}>{l.status}</Text>
            {l.onStatus ? <DownChevron size={m2.size.chevronStatus} stroke={m2.color.onDmQuiet} width={m2.size.chevronStroke} /> : null}
          </Press>
        ) : null}
      </View>
      {l.busy}
    </>
  );
}
