import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { Press, Text } from "../ui";

/** M2 `.dietnote`: what the preferences hide, counted, and Show all (or Hide them once revealed). Never edits the preferences. */
export function DietLine({ line, revealed, onToggle }: { line: string; revealed: boolean; onToggle: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 4, paddingLeft: m2.space.gutter, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: m2.color.hair }}>
      <Text v="note" color={m2.color.slate} style={{ flex: 1 }}>{line}</Text>
      <Press accessibilityRole="button" onPress={onToggle} style={{ height: m2.size.tap, paddingHorizontal: m2.space.panel, justifyContent: "center" }}>
        <Text v="link" color={m2.color.vm}>{revealed ? "Hide them" : "Show all"}</Text>
      </Press>
    </View>
  );
}
