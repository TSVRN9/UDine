import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { m2 } from "../../lib/theme";
import { Press, Text, tick } from "../ui";

/** M2 `.check`: a label (and a quieter line under it) with a 26 dp box at the right, filled maroon with a white tick when on. */
export function CheckRow({ label, line, lead, on, last, onToggle }: { label: string; line?: string; lead?: ReactNode; on: boolean; last?: boolean; onToggle: () => void }) {
  return (
    <Press feedback="tint" accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={line ? `${label}, ${line}` : label}
      onPress={() => { tick(); onToggle(); }}
      style={{ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: last ? 0 : 1, borderBottomColor: m2.color.hair }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: m2.space.panel, flex: 1, minWidth: 0 }}>
        {lead}
        <View style={{ flexShrink: 1 }}>
          <Text v="rowName" color={m2.color.ink}>{label}</Text>
          {line ? <Text v="meta" color={m2.color.slate} style={{ marginTop: 2 }}>{line}</Text> : null}
        </View>
      </View>
      <View style={{ width: 26, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: on ? m2.color.vm : "transparent", borderWidth: on ? 0 : 2, borderColor: m2.color.slate }}>
        {on ? <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke={m2.color.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M2.5 8.5l4 4 7-8" /></Svg> : null}
      </View>
    </Press>
  );
}
