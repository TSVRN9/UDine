import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { MEAL_LABEL, placeName } from "../logic/fixture";
import { fc } from "../logic/dishSheet";
import { Button, Text } from "../ui";
import { loggedCal, undo, useStore, type Receipt } from "../state/store";

/** M2 `showLogged`: the bar's slot after Log. What was logged and the day's calories so far, and Undo (outlined, in the bar's material). */
export function LogReceipt({ last }: { last: Receipt }) {
  const today = useStore((s) => loggedCal(s.log));
  const { entry } = last;
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: m2.space.panel }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text v="meta" color={m2.color.onDm} numberOfLines={1}>{`Logged ${entry.place ? placeName(entry.place) + " " : ""}${MEAL_LABEL[entry.meal].toLowerCase()}`}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: m2.space.barL2Top }}>
          <Text v="meta" color={m2.color.onDm}>{"Today "}</Text>
          <Text v="barNum" color={m2.color.white} style={{ marginRight: m2.space.barNumGap }}>{fc(today)}</Text>
          <Text v="meta" color={m2.color.onDm}>cal</Text>
        </View>
      </View>
      <Button kind="outline" size="md" label="Undo" onPress={undo} />
    </View>
  );
}
