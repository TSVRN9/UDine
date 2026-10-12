import { useState } from "react";
import { ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";
import { formatTimeOfDay } from "@udine/shared";
import { m2 } from "../../lib/theme";
import { MEAL_LABEL, loadFixture, placeName } from "../logic/fixture";
import { fc } from "../logic/dishSheet";
import { fq } from "../logic/plate";
import { dayFull, prefSummary } from "../logic/menuView";
import { ScoreBadge, Text } from "../ui";
import { RowChevron } from "../ui/Chevron";
import { LRow, LRowSub } from "../ui/LRow";
import { ScreenHeader } from "../ui/ScreenHeader";
import { PushDim, usePush } from "../ui/push";
import { setNewton, setShow, useStore, type LogEntry } from "../state/store";
import { CheckRow } from "./CheckRow";
import { DietPrefs } from "./DietPrefs";
import { Facts } from "./Facts";
import { PushPage } from "./PushPage";

const fx = loadFixture();
// the clock is fixed, so every meal was logged at the same minute
const TIME = formatTimeOfDay(new Date(fx.clock));
const DATE = dayFull(fx, 0);

const sum = (log: LogEntry[]) => log.reduce((a, e) => { for (const i of e.items) { a.cal += i.cal * i.qty; a.p += i.p * i.qty; a.c += i.c * i.qty; a.f += i.f * i.qty; } return a; }, { cal: 0, p: 0, c: 0, f: 0 });

const H2 = ({ children }: { children: string }) => (
  <Text v="section" color={m2.color.dm} accessibilityRole="header" style={{ marginBottom: m2.space.line }}>{children}</Text>
);

function Meal({ e }: { e: LogEntry }) {
  const total = e.items.reduce((a, i) => a + i.cal * i.qty, 0);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: m2.color.hair, paddingVertical: m2.space.part }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text v="rowName" color={m2.color.ink}>{`${MEAL_LABEL[e.meal]}${e.place ? " at " + placeName(e.place) : ""}`}</Text>
        <Text v="date" color={m2.color.slate}>{TIME}</Text>
      </View>
      {e.items.map((i, k) => (
        <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", minHeight: 32, marginTop: 4 }}>
          <Text v="empty" color={m2.color.slate} style={{ flex: 1, paddingRight: m2.space.panel }}>{(i.qty === 1 ? "" : `${fq(i.qty)} × `) + i.name}</Text>
          <Text v="factNum" color={m2.color.ink}>{fc(i.cal * i.qty)}</Text>
        </View>
      ))}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "baseline", gap: 4, marginTop: 4 }}>
        <Text v="mealCal" color={m2.color.ink}>{fc(total)}</Text>
        <Text v="mealCal" color={m2.color.ink}>cal</Text>
      </View>
    </View>
  );
}

/**
 * You as rounds 9 and 9b lay it out: the day so far (today's totals and the meals logged), then Dietary preferences (a page pushed from
 * the right), the Charles River Campus toggle and Show on dishes. Everything it toggles is the store's, so the menus, the dish sheet and
 * the bar change with it. Favorites, ranking and Export are not in the bake-off.
 */
export function YouScreen() {
  const log = useStore((s) => s.log);
  const prefs = useStore((s) => s.prefs);
  const show = useStore((s) => s.show);
  const newton = useStore((s) => s.newton);
  const [page, setPage] = useState(false);
  // a page pushed over You shifts and dims it (M2 `MO.push`), by the same `p` the page runs on
  const { p, below, dim } = usePush();
  const t = sum(log);
  return (
    <View style={{ flex: 1, backgroundColor: m2.color.chalk }}>
      <Animated.View style={[{ flex: 1 }, below]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <ScreenHeader variant="you" date={DATE} title="You" />
        <View style={{ paddingTop: m2.space.sectionTop, paddingHorizontal: m2.space.gutter }}>
          <H2>Today</H2>
          <Facts {...t} />
        </View>
        <View style={{ paddingTop: m2.space.sectionTop, paddingHorizontal: m2.space.gutter }}>
          <H2>Meals</H2>
          {log.length ? [...log].reverse().map((e) => <Meal key={e.id} e={e} />) : <Text v="empty" color={m2.color.slate}>Nothing logged yet today.</Text>}
        </View>
        <View style={{ paddingTop: m2.space.sectionTop, paddingHorizontal: m2.space.gutter }}>
          <LRow title="Dietary preferences" sub={<LRowSub>{prefSummary(prefs)}</LRowSub>} trailing={<RowChevron />} last onPress={() => { p.set(1); setPage(true); }} />
        </View>
        <View style={{ paddingTop: m2.space.sectionTop, paddingHorizontal: m2.space.gutter }}>
          <H2>Campus</H2>
          <CheckRow label="Charles River Campus" line="Newton" on={newton} last onToggle={() => setNewton(!newton)} />
        </View>
        <View style={{ paddingTop: m2.space.sectionTop, paddingHorizontal: m2.space.gutter }}>
          <H2>Show on dishes</H2>
          <CheckRow label="Healthfulness" lead={<ScoreBadge kind="health" value={5} size="sheet" />} on={show.health} onToggle={() => setShow({ health: !show.health })} />
          <CheckRow label="Carbon rating" lead={<ScoreBadge kind="carbon" value="B" size="sheet" />} on={show.carbon} last onToggle={() => setShow({ carbon: !show.carbon })} />
        </View>
      </ScrollView>
      </Animated.View>
      {page ? <><PushDim dim={dim} /><PushPage title="Dietary preferences" progress={p} onPop={() => setPage(false)}><DietPrefs /></PushPage></> : null}
    </View>
  );
}
