import type { ReactNode } from "react";
import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { Glyph } from "../ui/Glyph";
import { LRow, LRowSub } from "../ui/LRow";
import { tick } from "../ui";

/** M2 `.check`: an `LRow` with a 26 dp box at the right, filled maroon with a white tick when on. */
export function CheckRow({ label, line, lead, on, last, onToggle }: { label: string; line?: string; lead?: ReactNode; on: boolean; last?: boolean; onToggle: () => void }) {
  return (
    <LRow title={label} sub={line ? <LRowSub>{line}</LRowSub> : undefined} lead={lead} last={last}
      accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={line ? `${label}, ${line}` : label}
      onPress={() => { tick(); onToggle(); }}
      trailing={
        <View style={{ width: m2.size.check, height: m2.size.check, borderRadius: m2.radius.check, alignItems: "center", justifyContent: "center", backgroundColor: on ? m2.color.vm : "transparent", borderWidth: on ? 0 : m2.size.checkBorder, borderColor: m2.color.slate }}>
          {on ? <Glyph name="tick" size={m2.size.tick} tint={m2.color.white} /> : null}
        </View>
      } />
  );
}
