import { forwardRef } from "react";
import { Image, View } from "react-native";
import { m2 } from "../../lib/theme";
import { Press, Text } from "../ui";
import type { Item } from "../logic/menuView";
import type { Dish, MealKey, PlaceKey } from "../logic/types";
import type { Toggles } from "../state/store";
import { EVENT_PHOTO } from "../photos";
import type { MenuState } from "../logic/net";
import { DietLine } from "./DietLine";
import { DishRow } from "./DishRow";
import { MealPager, type PagerHandle } from "./MealPager";
import { StateCurtain } from "./NetState";

const keyOf = (it: Item, i: number) => (it.t === "dish" ? `d:${it.dish.station}:${it.dish.key}` : it.t === "head" ? `h:${it.name}` : `${it.t}${i}`);
const typeOf = (it: Item) => it.t;

/** What a row needs to know about the screen it is on. */
export interface RowContext {
  scores: Toggles; day: number; place: PlaceKey; meal: MealKey; onOpen: (dish: Dish) => void; hereKey: string | null;
  onToggleAll: () => void; onEvent?: (i: number) => void;
}

/** One line of the hall's list: a station head, the diet note, a holiday's note, a café's body, an empty day, or a dish. */
export function MenuItem({ it, row }: { it: Item; row: RowContext }) {
  switch (it.t) {
    case "note": return <DietLine line={it.line} revealed={it.revealed} onToggle={row.onToggleAll} />;
    case "head": return <View style={{ height: m2.size.stationRow, paddingHorizontal: m2.space.gutter, paddingBottom: m2.space.stationHeadBottom, justifyContent: "flex-end", backgroundColor: m2.color.chalk }}><Text v="stationHead" color={m2.color.dm} accessibilityRole="header">{it.name}</Text></View>;
    case "event":
      // M2 `.evrow.evnote` on its own day: the title only, no date tag; it opens the event's page
      return (
        <Press feedback="tint" accessibilityRole="button" accessibilityLabel={it.title} disabled={!row.onEvent} onPress={() => row.onEvent?.(it.i)}
          style={{ minHeight: m2.size.evrow, paddingHorizontal: m2.space.gutter, paddingVertical: m2.space.evrow, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: m2.color.hair }}>
          <Text v="link" color={m2.color.dm}>{it.title}</Text>
          {/* the event page's banner is decoded now, so it is there when the page arrives (it was drawn a few frames after the push began) */}
          {EVENT_PHOTO[it.title] ? <Image source={EVENT_PHOTO[it.title]} accessible={false} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} /> : null}
        </Press>
      );
    case "cafe":
      // M2 `cafeBody`: what the café is, and that the feed carries no dishes for it
      return (
        <View style={{ paddingHorizontal: m2.space.gutter, paddingTop: m2.space.cafeBodyTop }}>
          {it.description ? <Text v="desc" color={m2.color.ink}>{it.description}</Text> : null}
          <Text v="section" color={m2.color.dm} accessibilityRole="header" style={{ marginTop: m2.space.group, marginBottom: m2.space.line }}>Menu</Text>
          <Text v="sched" color={m2.color.slate}>{`${it.name} doesn't list its menu in the app.`}</Text>
        </View>
      );
    case "empty": return <View style={{ paddingHorizontal: m2.space.gutter, paddingTop: m2.space.stateTop, paddingBottom: m2.space.part }}><Text v="empty" color={m2.color.slate}>{it.text}</Text></View>;
    default: return <DishRow dish={it.dish} contains={it.contains} scores={row.scores} lane={row.day === 0} place={row.place} meal={row.meal} onOpen={row.onOpen} here={it.dish.key === row.hereKey} />;
  }
}

/**
 * The hall's list: its rows (`MenuItem`) under a spacer the height of the pinned header, the network state's curtain over them when
 * there is no menu, and the meal change's shared axis (`MealPager`).
 */
export const MenuList = forwardRef<PagerHandle, {
  items: Item[]; state: MenuState; stateText: string; row: RowContext;
  /** the header and its pinned rows: the list starts under them, and a curtain starts under them too */
  head: number;
  animatedRef: unknown; holdOn: { get: () => number }; onScroll: unknown; scrollY: { get: () => number }; onViewable: () => void;
}>(function MenuList({ items, state, stateText, row, head, animatedRef, holdOn, onScroll, scrollY, onViewable }, ref) {
  return (
    <MealPager
      ref={ref} data={items} renderItem={(it: Item) => <MenuItem it={it} row={row} />} animatedRef={animatedRef} holdOn={holdOn} onScroll={onScroll} scrollY={scrollY} onViewable={onViewable}
      keyOf={keyOf} typeOf={typeOf}
      curtain={state === "ok" ? undefined : (copy) => <StateCurtain copy={copy} state={state} top={head} text={stateText} />}
      header={<View style={{ height: head, backgroundColor: m2.color.dm }} />} footer={<View style={{ height: m2.size.listFoot }} />}
    />
  );
});
