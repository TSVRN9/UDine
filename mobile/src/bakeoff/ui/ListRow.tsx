import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { Text } from "./Text";

/**
 * M2 `.row`: name over a meta line, a control lane at the right, a hairline under. `marks` ride inline after the name's
 * last word, which they never part from (a patch never sits alone on a line). `lane` reserves M2's 114 px control lane. `here` tints the row M2 brought a dish up to (`.row.here`).
 */
// Android lays an inline View against the baseline and clips the line's descenders, so a mark rides on the name as invisible
// non-breaking spaces (they wrap with the last word, as M2's `nw`) and is drawn over them where the last line ends.
const SLOT = "\u00A0".repeat(7);
let slotW = 0;
// where each name's last line ends, so a row drawn again (the copy a day change holds) wears its patch at once
const ends = new Map<string, { x: number; y: number }>();

export function ListRow({ name, marks, meta, trailing, lane, onPress, here }: { here?: boolean; name: string; marks?: ReactNode; meta?: ReactNode; trailing?: ReactNode; lane?: boolean; onPress?: () => void }) {
  const [end, setEnd] = useState<{ x: number; y: number } | null>(() => ends.get(name) ?? null);
  return (
    <Press feedback="tint" onPress={onPress} style={{ minHeight: m2.size.row, flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingLeft: m2.space[4], paddingRight: m2.space[1] }}>
      {here ? <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: m2.color.here }} /> : null}
      <View style={{ flex: 1, minWidth: 0, marginRight: m2.space[1] }}>
        <View>
          <Text v="rowName" onTextLayout={marks ? (e) => { const l = e.nativeEvent.lines[e.nativeEvent.lines.length - 1]; if (l) { const e = { x: l.x + l.width, y: l.y }; ends.set(name, e); setEnd(e); } } : undefined}>
            {marks ? name + SLOT : name}
          </Text>
          {marks && end ? <View style={{ position: "absolute", left: end.x - (slotW || 26) + 6, top: end.y + 2 }}>{marks}</View> : null}
          {marks && !slotW ? <Text v="rowName" style={{ position: "absolute", opacity: 0 }} onLayout={(e) => { slotW = e.nativeEvent.layout.width; }}>{SLOT}</Text> : null}
        </View>
        {meta ? <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 4, marginTop: 3 }}>{meta}</View> : null}
      </View>
      {lane ? <View style={{ width: 114, alignItems: "flex-end" }}>{trailing}</View> : trailing}
      <View pointerEvents="none" style={{ position: "absolute", left: m2.space[4], right: 0, bottom: 0, height: 1, backgroundColor: m2.color.hair }} />
    </Press>
  );
}
