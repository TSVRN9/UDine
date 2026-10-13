import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { HallChip, Text } from "../ui";
import { isCafe, placeName } from "../logic/fixture";
import type { ServeTarget } from "../logic/dishSheet";
import type { Dish } from "../logic/types";
import { whenText, type WhereGroup } from "../logic/where";

/**
 * M2 `whereHTML`: where you can get the dish, now or next. One line per answer (at most two), each place a tag that opens it there.
 * Never says where it is not: a dish with no serving left says so in one line.
 */
export function WhereServed({ dish, answer, onServe }: { dish: Dish; answer: WhereGroup[]; onServe: (t: ServeTarget) => void }) {
  return (
    <View style={{ marginTop: m2.space.group }}>
      {answer.length === 0 ? <Text v="sheetHead" color={m2.color.dm}>Not on the menu again today or tomorrow</Text> : null}
      {answer.map((g, i) => (
        <View key={`${g.st}${g.meal}${g.open}`} style={i ? { marginTop: m2.space.action } : null}>
          <Text v={i ? "sheetHeadSm" : "sheetHead"} color={i ? m2.color.vm : m2.color.dm} style={{ marginBottom: m2.space.part }}>{whenText(g, answer[i - 1])}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: m2.space.part }}>
            {g.halls.map((h) => (
              <HallChip key={h} name={placeName(h)} letter={isCafe(h) ? undefined : h} onPress={() => onServe({ place: h, meal: g.meal, day: g.day, dish: dish.key })} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
