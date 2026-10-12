import { m2 } from "../../lib/theme";
import { Press, Text } from "../ui";
import { HairRow } from "../ui/HairRow";

/** M2 `.dietnote`: what the preferences hide, counted, and Show all (or Hide them once revealed). Never edits the preferences. */
export function DietLine({ line, revealed, onToggle }: { line: string; revealed: boolean; onToggle: () => void }) {
  return (
    <HairRow style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: m2.space.part, paddingVertical: m2.space.line, paddingLeft: m2.space.gutter, paddingRight: m2.space.part }}>
      <Text v="note" color={m2.color.slate} style={{ flex: 1 }}>{line}</Text>
      <Press accessibilityRole="button" onPress={onToggle} style={{ height: m2.size.tap, paddingHorizontal: m2.space.panel, justifyContent: "center" }}>
        <Text v="link" color={m2.color.vm}>{revealed ? "Hide them" : "Show all"}</Text>
      </Press>
    </HairRow>
  );
}
