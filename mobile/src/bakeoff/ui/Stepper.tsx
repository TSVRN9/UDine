import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { Text } from "./Text";

const Glyph = ({ d }: { d: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={m2.color.vm} strokeWidth={2.4} strokeLinecap="round"><Path d={d} /></Svg>
);

/** M2 `.step`: tint capsule, - qty +. `label` is the formatted quantity (e.g. "1/2"). */
export function Stepper({ label, onDec, onInc }: { label: string; onDec: () => void; onInc: () => void }) {
  const btn = { width: m2.size.tap, height: m2.size.tap, alignItems: "center", justifyContent: "center" } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: m2.size.tap, borderRadius: m2.radius.button, backgroundColor: m2.color.tint }}>
      <Press accessibilityRole="button" accessibilityLabel="Decrease" onPress={onDec} style={btn}><Glyph d="M5 12h14" /></Press>
      <Text v="stepper" color={m2.color.dm} style={{ minWidth: 26, textAlign: "center" }}>{label}</Text>
      <Press accessibilityRole="button" accessibilityLabel="Increase" onPress={onInc} style={btn}><Glyph d="M12 5v14M5 12h14" /></Press>
    </View>
  );
}
