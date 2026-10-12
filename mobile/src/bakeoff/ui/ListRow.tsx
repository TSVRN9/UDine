import type { ReactNode } from "react";
import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { Text } from "./Text";

/** M2 `.row`: name over a meta line, a control lane at the right, a hairline under. */
export function ListRow({ name, meta, trailing, onPress }: { name: string; meta?: ReactNode; trailing?: ReactNode; onPress?: () => void }) {
  return (
    <Press feedback="tint" onPress={onPress} style={{ minHeight: m2.size.row, flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingLeft: m2.space[4], paddingRight: m2.space[1] * 2, gap: m2.space[1] * 2 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text v="rowName">{name}</Text>
        {meta ? <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, marginTop: 3 }}>{meta}</View> : null}
      </View>
      {trailing}
      <View pointerEvents="none" style={{ position: "absolute", left: m2.space[4], right: 0, bottom: 0, height: 1, backgroundColor: m2.color.hair }} />
    </Press>
  );
}
