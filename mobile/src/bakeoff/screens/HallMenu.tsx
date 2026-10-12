import { useCallback, useEffect, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, {
  Easing, runOnJS, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { emphasized, m2Motion, standardDecelerate } from "../../lib/motion";
import { Board, BusyRow, HallLetter, Header, Photo, Press, Text, thud, tick } from "../ui";
import { BAR } from "../ui/Header";
import { boardAt, busyView } from "../logic/busy";
import { MEAL_LABEL, loadFixture } from "../logic/fixture";
import { HALL_LX } from "../logic/letters";
import { dayCell, dayFull, dayIsos, defaultMeal, isOneMeal, mealsOf, menuItems, menuView, type Item } from "../logic/menuView";
import { schedule, statusLine } from "../logic/schedule";
import type { MealKey, PlaceKey } from "../logic/types";
import type { useContainerTransform } from "../motion/useContainerTransform";
import { PHOTO_POS, photoOf } from "../photos";
import { useBakeoffState } from "../state/prefs";
import { DietLine } from "./DietLine";
import { DishRow } from "./DishRow";
import { headerHeight } from "./HallsList";
import { HoursSheet } from "./HoursSheet";
import { MealPager, type PagerHandle } from "./MealPager";
import { StationSwitcher } from "./StationSwitcher";

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
const clamp = (x: number) => {
  "worklet";
  return Math.min(1, Math.max(0, x));
};

const Back = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={m2.color.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
);

const mealWord = (m: MealKey) => (m === "grab" ? "Grab 'N Go" : MEAL_LABEL[m].toLowerCase());

/**
 * The hall (or café) screen the container transform opens into. The photo, letter and name are written once per place and
 * never re-render or fade on a day change; what says the day (status, busy, tab and station labels, the list) fades through.
 * `ghost` is the band's copy that rides on the photo while the container opens.
 */
export function HallMenu({ t, H, place, name, scrollY, ghost, onBack }: {
  t: ReturnType<typeof useContainerTransform>; H: number; place: PlaceKey; name: string; scrollY: SharedValue<number>; ghost: React.ReactNode; onBack: () => void;
}) {
  const { width, height: winH } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const fx = loadFixture();
  const now = new Date(fx.clock);
  const { prefs, scores } = useBakeoffState();
  const compact = place.startsWith("c");
  const one = isOneMeal(fx, place);
  const isos = dayIsos(fx);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- __DEV__ is a build-time constant
  const dev = __DEV__ ? useLocalSearchParams<{ day?: string; meal?: string; sheet?: string; y?: string; reveal?: string }>() : {};

  const [day, setDay] = useState(() => +(dev.day ?? 0) || 0);
  const [mealSel, setMealSel] = useState<MealKey>((dev.meal as MealKey) ?? "lunch");
  const [showAll, setShowAll] = useState(() => dev.reveal === "1");
  const [sheet, setSheet] = useState<"hours" | "stations" | null>(null);
  const [cur, setCur] = useState(0);
  // the container opens before the list is drawn: mounting ~30 rows blocks JS, and the open's clock starts at the first layout
  const [warm, setWarm] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setWarm(true)); return () => cancelAnimationFrame(id); }, []);
  const iso = isos[day];
  const meals = mealsOf(fx, iso, place);
  const meal = defaultMeal(fx, iso, place, mealSel);

  const view = menuView(fx, iso, place, meal, prefs, showAll);
  const empty = !meals.length ? `No menu posted for ${dayFull(fx, day)}.` : "";
  const items = menuItems(view, prefs, showAll, empty);
  const heads = items.flatMap((it, i) => (it.t === "head" ? [i] : []));
  const stationLabel = view.sections[Math.min(cur, view.sections.length - 1)]?.name ?? "";

  // ---- geometry: M2 HH, CH, TH, SWH, PIN
  const HH = headerHeight(top), R = HH - top - BAR;
  const TH = one ? 0 : m2.size.tabs, SWH = m2.size.tabs, PIN = top + BAR + TH + SWH;
  const y = scrollY;
  const c = useDerivedValue(() => clamp(y.get() / R));
  const pager = useRef<PagerHandle>(null);
  const aref = useAnimatedRef<any>();
  const headY = useSharedValue<number[]>([]);
  const jump = useSharedValue(-1);

  const onScroll = useAnimatedScrollHandler((e) => { y.set(e.contentOffset.y); });
  const headerTx = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.min(Math.max(y.get(), 0), R) }] }));

  // station you are at: the last head at or above the pinned rows (M2 curStation); only a change crosses to JS
  useAnimatedReaction(
    () => { const yy = y.get() + PIN + 2, h = headY.get(); let k = 0; for (let i = 0; i < h.length; i++) if (h[i] <= yy) k = i; return k; },
    (k, prev) => { if (k !== prev) runOnJS(setCur)(k); },
  );
  const refreshHeads = () => {
    const l = pager.current?.list();
    if (!l) return;
    const off = l.getFirstItemOffset();
    headY.set(heads.map((i) => (l.getLayout(i)?.y ?? 0) + off));
  };
  useEffect(() => { const id = requestAnimationFrame(refreshHeads); return () => cancelAnimationFrame(id); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // station jump: one shared value on M2's scroll timing drives scrollTo on the UI thread, no JS per frame
  useAnimatedReaction(() => jump.get(), (v) => { if (v >= 0) scrollTo(aref, 0, v, false); });
  const jumpTo = (si: number) => {
    refreshHeads();
    const target = Math.max(0, (headY.get()[si] ?? 0) - PIN);
    jump.set(y.get());
    jump.set(withTiming(target, { duration: m2Motion.scroll.d, easing: emphasized }, (done) => { if (done) jump.set(-1); }));
    tick();
  };

  // ---- day change (M2 changeDay): everything that says the day fades out where it is, then the new day fades in
  const f = useSharedValue(1), sc = useSharedValue(1);
  const FT = m2Motion.fadeThrough, fade = standardDecelerate;
  const swap = useCallback((i: number) => {
    const keep = Math.min(y.get(), R);
    setDay(i);
    // the list is drawn under the fade; start the fade in once it has been
    requestAnimationFrame(() => requestAnimationFrame(() => {
      pager.current?.list()?.scrollToOffset({ offset: keep, animated: false });
      sc.set(FT.scale);
      f.set(withTiming(1, { duration: FT.d * (1 - m2Motion.sharedX.at), easing: fade }));
      sc.set(withTiming(1, { duration: FT.d * (1 - m2Motion.sharedX.at), easing: fade }));
    }));
  }, [y, R, f, sc, FT, fade]);
  const changeDay = useCallback((i: number) => {
    f.set(withTiming(0, { duration: FT.d * m2Motion.sharedX.at, easing: Easing.linear }, (done) => { if (done) runOnJS(swap)(i); }));
  }, [f, swap, FT]);
  const parts = useAnimatedStyle(() => ({ opacity: f.get() }));
  const listFade = useAnimatedStyle(() => ({ opacity: f.get(), transform: [{ scale: sc.get() }], transformOrigin: `50% ${(H + PIN) / 2}px` }));

  // ---- meals
  const pickMeal = (m: MealKey) => {
    if (m === meal) return;
    const dir = Math.sign(meals.indexOf(m) - meals.indexOf(meal)) as 1 | -1;
    tick();
    pager.current?.shift(dir, () => setMealSel(m));
    requestAnimationFrame(() => { if (y.get() > R) pager.current?.list()?.scrollToOffset({ offset: R, animated: false }); });
  };

  // ---- sheets
  const hoursRef = useRef<BottomSheetModal>(null), stRef = useRef<BottomSheetModal>(null);
  const pending = useRef<{ day: number } | null>(null);
  const sched = schedule(fx, place, day);
  const openHours = () => { setSheet("hours"); hoursRef.current?.present(); thud(); };
  const openStations = () => { if (!view.sections.length) return; setSheet("stations"); stRef.current?.present(); thud(); };
  const onDismiss = () => {
    setSheet(null);
    const p = pending.current;
    pending.current = null;
    if (p?.day != null) changeDay(p.day);
  };
  useEffect(() => {
    if (!__DEV__ || !(dev.sheet || dev.y)) return;
    const id = setTimeout(() => {
      if (dev.y) pager.current?.list()?.scrollToOffset({ offset: +dev.y, animated: false });
      if (dev.sheet === "hours") openHours();
      if (dev.sheet === "stations") openStations();
    }, 1200);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the header
  const src = photoOf(place, name);
  const busy = compact ? null : busyView(fx.busy[place as "W"]);
  const live = !compact && day === 0;
  const hallLetter = compact ? null : <HallLetter letter={place as "W"} x={HALL_LX[place as "W"]} top={top + 26} />;
  const status = statusLine(fx, place, day);
  const mealItems = meals.map((m) => ({ key: m, label: MEAL_LABEL[m] }));

  const renderItem = (it: Item) => {
    switch (it.t) {
      case "note": return <DietLine line={it.line} revealed={it.revealed} onToggle={() => setShowAll((s) => !s)} />;
      case "head": return <View style={{ height: 50, paddingHorizontal: m2.space[4], paddingBottom: 6, justifyContent: "flex-end", backgroundColor: m2.color.chalk }}><Text v="stationHead" color={m2.color.dm} accessibilityRole="header">{it.name}</Text></View>;
      case "empty": return <View style={{ paddingHorizontal: m2.space[4], paddingTop: 28, paddingBottom: 8 }}><Text v="empty" color={m2.color.slate}>{it.text}</Text></View>;
      default: return <DishRow dish={it.dish} contains={it.contains} scores={scores} lane={day === 0} />;
    }
  };

  return (
    <View style={fill} pointerEvents="box-none">
      <Animated.View style={[fill, { backgroundColor: m2.color.chalk }, t.style.incoming, listFade]}>
        {warm ? <MealPager
          ref={pager} data={items} renderItem={renderItem} animatedRef={aref} onScroll={onScroll} scrollY={y} onViewable={refreshHeads}
          keyOf={(it, i) => `${it.t}${i}`} typeOf={(it: Item) => it.t}
          header={<View style={{ height: HH + TH + SWH, backgroundColor: m2.color.dm }} />} footer={<View style={{ height: 120 }} />}
        /> : null}
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[{ position: "absolute", top: 0, left: 0, right: 0 }, headerTx]}>
        <Header
          title={name} top={top} height={HH}
          status={status} onStatus={status ? openHours : undefined}
          busy={busy ? <View style={{ opacity: live ? 1 : 0 }} pointerEvents="none"><BusyRow {...busy} header /></View> : undefined}
          board={live ? <Board columns={boardAt(fx.typical[place as "W"], fx.busy[place as "W"], now.getHours() * 60 + now.getMinutes())} /> : undefined}
          photo={src ? <Photo source={src} width={width} height={HH} pos={compact ? 0.5 : PHOTO_POS[place as "W"]} duo={t.style.photo} /> : undefined}
          letter={<>
            {hallLetter ? <Animated.View pointerEvents="none" style={[fill, t.style.incoming]}>{hallLetter}</Animated.View> : null}
            {ghost}
          </>}
          meals={one ? undefined : { items: mealItems, selected: meal, onSelect: (k) => pickMeal(k as MealKey) }}
          station={stationLabel ? { label: stationLabel, onPress: openStations, open: sheet === "stations" } : undefined}
          day={{ label: dayCell(fx, day), accessibilityLabel: `${dayFull(fx, day)}, change the day`, onPress: openHours }}
          gradStyle={t.style.grad} contentStyle={t.style.incoming} partsStyle={parts} collapse={c}
        />
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[{ position: "absolute", top, left: 4, height: BAR, justifyContent: "center" }, t.style.incoming]}>
        <Press accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: m2.size.tap + 4, height: m2.size.tap + 4, alignItems: "center", justifyContent: "center" }}><Back /></Press>
      </Animated.View>
      {warm ? <HoursSheet ref={hoursRef} s={sched} maxHeight={winH * 0.86} onPick={(i) => { if (i === day) hoursRef.current?.dismiss(); else { pending.current = { day: i }; hoursRef.current?.dismiss(); tick(); } }} onDismiss={onDismiss} /> : null}
      {warm ? <StationSwitcher
        ref={stRef} maxHeight={winH * 0.86} onDismiss={onDismiss} current={Math.min(cur, view.sections.length - 1)}
        title={`${name} ${mealWord(meal)}${day ? ", " + dayCell(fx, day) : ""}`}
        stations={view.sections.map((s) => ({ name: s.name, count: s.dishes.length }))}
        onPick={(si) => { stRef.current?.dismiss(); jumpTo(si); }}
      /> : null}
    </View>
  );
}
