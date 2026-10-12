import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { fc } from "../logic/dishSheet";
import { Text } from "../ui";

const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");

/** M2 `factsHTML`: the plate's totals in the Nutrition Facts treatment (a boxed panel, Calories over a heavy rule, then protein, carbs and fat). */
export function Facts({ cal, p, c, f, label = "Calories" }: { cal: number; p: number; c: number; f: number; label?: string }) {
  const row = (name: string, v: number, last?: boolean) => (
    <View key={name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", borderBottomWidth: last ? 0 : 1, borderBottomColor: m2.color.dm, paddingTop: 7, paddingBottom: 5 }}>
      <Text v="factRow" color={m2.color.dm}>{name}</Text>
      <Text v="factNum" color={m2.color.dm}>{`${f1(v)}g`}</Text>
    </View>
  );
  return (
    <View style={{ borderWidth: 2, borderColor: m2.color.dm, paddingTop: 4, paddingHorizontal: m2.space.panel, paddingBottom: 6, backgroundColor: m2.color.white }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 7, borderBottomColor: m2.color.dm, paddingTop: 2, paddingBottom: 4 }}>
        <Text v="lblLg" color={m2.color.dm} style={{ fontFamily: m2.font.bodySb }}>{label}</Text>
        <Text v="calNum" color={m2.color.dm}>{fc(cal)}</Text>
      </View>
      {row("Protein", p)}{row("Carbs", c)}{row("Fat", f, true)}
    </View>
  );
}
