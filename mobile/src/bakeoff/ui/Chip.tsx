import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { Text } from "./Text";

/** M2 `.hchip`: deep-maroon tag, optional gold letter patch, name. */
export function Chip({ label, letter, onPress }: { label: string; letter?: string; onPress?: () => void }) {
  return (
    <Press accessibilityRole="button" onPress={onPress}
      style={{ height: m2.size.tap, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: letter ? m2.space[1] * 2 : m2.space[3] + 4, paddingRight: m2.space[3] + 4, borderRadius: m2.radius.button, backgroundColor: m2.color.dm }}>
      {letter ? (
        <View style={{ width: 28, height: 28, borderRadius: m2.radius.patch, backgroundColor: m2.color.gold, alignItems: "center", justifyContent: "center" }}>
          <Text v="letter" color={m2.color.dm}>{letter}</Text>
        </View>
      ) : null}
      <Text v="letter" color={m2.color.white}>{label}</Text>
    </Press>
  );
}
