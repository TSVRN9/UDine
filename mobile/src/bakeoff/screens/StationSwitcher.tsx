import { forwardRef } from "react";
import { View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { Press, Sheet, Text } from "../ui";

/** M2's station roster (`#stidx`): the meal's stations with their dish counts, the current one marked. */
export const StationSwitcher = forwardRef<BottomSheetModal, {
  title: string; stations: { name: string; count: number }[]; current: number; maxHeight: number; onPick: (si: number) => void; onDismiss: () => void;
}>(function StationSwitcher({ title, stations, current, maxHeight, onPick, onDismiss }, ref) {
  return (
    <Sheet ref={ref} maxHeight={maxHeight} onDismiss={onDismiss}>
      <Text v="schedHead" color={m2.color.dm} style={{ marginTop: m2.space.schedNameTop, marginBottom: m2.space.schedGap }}>{title}</Text>
      <View accessibilityRole="list" style={{ marginHorizontal: -m2.space.gutter }}>
        {stations.map((s, si) => {
          const cur = si === current;
          return (
            <Press key={s.name} feedback="tint" accessibilityRole="button" accessibilityState={{ selected: cur }} onPress={() => onPick(si)}
              style={{ minHeight: m2.size.listRow, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: m2.space.gutter, paddingLeft: m2.space.action, borderLeftWidth: m2.size.curBar, borderLeftColor: cur ? m2.color.vm : "transparent" }}>
              <Text v="dayRow" color={cur ? m2.color.vm : m2.color.ink} style={cur ? { fontFamily: m2.font.bodyB } : null}>{s.name}</Text>
              <Text v="metaNum" color={m2.color.slate}>{s.count}</Text>
            </Press>
          );
        })}
      </View>
    </Sheet>
  );
});
