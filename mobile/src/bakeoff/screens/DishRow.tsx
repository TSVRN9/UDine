import { memo } from "react";
import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { DietBadge, ListRow, ScoreBadge, Text } from "../ui";
import type { Toggles } from "../state/prefs";
import { rowScores } from "../logic/menuView";
import type { Dish } from "../logic/types";

const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
const fc = (x: number) => Math.round(x).toLocaleString("en-US");

/**
 * One dish: name with its diet patch, then the meta line of groups that wrap whole: Contains (revealed rows only), the
 * numbers, then the scores. A dish with nothing to score has no scores group, so a row's height never depends on the toggles
 * for it. `lane` reserves the control lane Task 7's + lives in (today's rows only).
 */
export const DishRow = memo(function DishRow({ dish, contains, scores, lane }: { dish: Dish; contains: string[]; scores: Toggles; lane: boolean }) {
  const sc = rowScores(dish, scores);
  return (
    <ListRow
      name={dish.name} lane={lane}
      marks={dish.diet & 3 ? <DietBadge diet={dish.diet} /> : undefined}
      meta={
        <>
          {contains.length ? <Text v="meta" color={m2.color.vm} style={{ fontFamily: m2.font.bodySb }}>{`Contains ${contains.length < 2 ? contains.join("").toLowerCase() : contains.slice(0, -1).join(", ").toLowerCase() + " and " + contains[contains.length - 1].toLowerCase()}`}</Text> : null}
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text v="metaNum" color={m2.color.ink}>{fc(dish.cal)}</Text><Text v="meta" color={m2.color.slate}>{" cal"}</Text>
            <View style={{ width: 16 }} />
            <Text v="metaNum" color={m2.color.ink}>{`${f1(dish.p)}g`}</Text><Text v="meta" color={m2.color.slate}>{" protein"}</Text>
          </View>
          {sc ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginVertical: -1 }}>
              <ScoreBadge kind="health" value={sc.health} size="row" />
              <ScoreBadge kind="carbon" value={sc.carbon} size="row" />
            </View>
          ) : null}
        </>
      }
    />
  );
});
