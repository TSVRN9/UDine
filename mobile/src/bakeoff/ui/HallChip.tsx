import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { Text } from "./Text";

/**
 * M2 `.hchip`: one place that serves the dish, a 44 high deep-maroon tag. A hall wears its varsity letter (gold felt, stitched)
 * before its name; a café has no letter, so its name sits on the tag alone.
 */
export function HallChip({ name, letter, onPress }: { name: string; letter?: string; onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={name} onPress={onPress}
      style={{ height: 44, paddingLeft: letter ? 8 : 16, paddingRight: 16, borderRadius: m2.radius.button, backgroundColor: m2.color.dm, flexDirection: "row", alignItems: "center", gap: 10 }}>
      {letter ? (
        <View style={{ width: 28, height: 28, borderRadius: m2.radius.patch, backgroundColor: m2.color.gold, alignItems: "center", justifyContent: "center" }}>
          <View pointerEvents="none" style={{ position: "absolute", top: 2, left: 2, right: 2, bottom: 2, borderRadius: 2, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(59,10,15,0.75)" }} />
          <Text v="letter" color={m2.color.dm}>{letter}</Text>
        </View>
      ) : null}
      <Text v="chip" color={m2.color.white}>{name}</Text>
    </Press>
  );
}
