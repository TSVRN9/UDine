import { View } from "react-native";
import { Glyph } from "./Glyph";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { tapBox } from "./tap";
import { Text } from "./Text";

const Sign = ({ name }: { name: "plus" | "minus" }) => <Glyph name={name} size={m2.size.glyph} tint={m2.color.vm} />;

/** M2 `.step`: tint capsule, - qty +. `label` is the formatted quantity (e.g. "1/2"). */
export function Stepper({ label, onDec, onInc }: { label: string; onDec: () => void; onInc: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: m2.size.tap, borderRadius: m2.radius.button, backgroundColor: m2.color.tint }}>
      <Press accessibilityRole="button" accessibilityLabel="Decrease" onPress={onDec} style={tapBox}><Sign name="minus" /></Press>
      <Text v="stepper" color={m2.color.dm} style={{ minWidth: m2.size.stepQ, textAlign: "center" }}>{label}</Text>
      <Press accessibilityRole="button" accessibilityLabel="Increase" onPress={onInc} style={tapBox}><Sign name="plus" /></Press>
    </View>
  );
}
