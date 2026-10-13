import { memo } from "react";
import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { DietBadge, ListRow, ScoreBadge, Text } from "../ui";
import type { Toggles } from "../state/store";
import { fc } from "../logic/dishSheet";
import { rowScores } from "../logic/menuView";
import type { Dish, MealKey, PlaceKey } from "../logic/types";
import { RowControl } from "./RowControl";

const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");

/**
 * One dish: name with its diet patch, then the meta line of groups that wrap whole: Contains (revealed rows only), the
 * numbers, then the scores. A dish with nothing to score has no scores group, so a row's height never depends on the toggles
 * for it. `lane` reserves the control lane the row's + lives in (today's rows only). `onOpen` is one stable callback for every row (it opens the dish sheet).
 */
export const DishRow = memo(function DishRow({ dish, contains, scores, lane, place, meal, onOpen, here }: { here?: boolean; dish: Dish; contains: string[]; scores: Toggles; lane: boolean; /** where it is served, and the plate meal an add counts for */ place: PlaceKey; meal: MealKey; onOpen?: (dish: Dish) => void }) {
  const sc = rowScores(dish, scores);
  return (
    <ListRow
      name={dish.name} lane={lane} here={here} trailing={lane ? <RowControl place={place} meal={meal} dish={dish} /> : undefined} onPress={onOpen ? () => onOpen(dish) : undefined}
      marks={dish.diet & 3 ? <DietBadge diet={dish.diet} /> : undefined}
      meta={
        <>
          {contains.length ? <Text v="meta" color={m2.color.vm} style={{ fontFamily: m2.font.bodySb }}>{`Contains ${contains.length < 2 ? contains.join("").toLowerCase() : contains.slice(0, -1).join(", ").toLowerCase() + " and " + contains[contains.length - 1].toLowerCase()}`}</Text> : null}
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text v="metaNum" color={m2.color.ink}>{fc(dish.cal)}</Text><Text v="meta" color={m2.color.slate}>{" cal"}</Text>
            <View style={{ width: m2.space.action }} />
            <Text v="metaNum" color={m2.color.ink}>{`${f1(dish.p)}g`}</Text><Text v="meta" color={m2.color.slate}>{" protein"}</Text>
          </View>
          {sc ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: m2.space.scoreGap, marginVertical: -m2.space.tileRide }}>
              <ScoreBadge kind="health" value={sc.health} size="row" />
              <ScoreBadge kind="carbon" value={sc.carbon} size="row" />
            </View>
          ) : null}
        </>
      }
    />
  );
}, (a, b) =>
  // `contains` is rebuilt with every list (a new array, the same words): compare it by what it says
  a.dish === b.dish && a.contains.join("|") === b.contains.join("|") && a.scores.health === b.scores.health && a.scores.carbon === b.scores.carbon
  && a.lane === b.lane && a.place === b.place && a.meal === b.meal && a.onOpen === b.onOpen && a.here === b.here);
