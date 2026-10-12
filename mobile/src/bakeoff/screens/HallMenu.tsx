import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, {
  runOnJS, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { emphasized, m2Linear, m2Motion, standardDecelerate } from "../../lib/motion";
import { Board, BusyRow, HallLetter, Header, Photo, Press, Text, thud, tick } from "../ui";
import type { Labels } from "../ui/Header";
import { BAR } from "../ui/Header";
import { boardAt, busyView } from "../logic/busy";
import { MEAL_LABEL, loadFixture } from "../logic/fixture";
import { HALL_LX } from "../logic/letters";
import { dayCell, dayFull, dayIsos, defaultMeal, isOneMeal, mealsOf, menuItems, menuView, type Item } from "../logic/menuView";
import { schedule, statusLine } from "../logic/schedule";
import type { ServeTarget } from "../logic/dishSheet";
import type { Dish, MealKey, PlaceKey } from "../logic/types";
import { openDish } from "../state/dishSheet";
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

// one fixture for the screen: a stable object, so the memos below depend only on what changes
const fx = loadFixture();
const isos = dayIsos(fx);

const keyOf = (it: Item, i: number) => (it.t === "dish" ? `d:${it.dish.station}:${it.dish.key}` : it.t === "head" ? `h:${it.name}` : `${it.t}${i}`);
const typeOf = (it: Item) => it.t;

const mealWord = (m: MealKey) => (m === "grab" ? "Grab 'N Go" : MEAL_LABEL[m].toLowerCase());

/**
 * The hall (or café) screen the container transform opens into. The photo, letter and name are written once per place and
 * never re-render or fade on a day change; what says the day (status, busy, tab and station labels, the list) fades through.
 * `ghost` is the band's copy that rides on the photo while the container opens.
 */
export function HallMenu({ t, H, place, name, scrollY, ghost, onBack, at, onPush, onPushGo, onSettled }: {
  t: ReturnType<typeof useContainerTransform>; H: number; place: PlaceKey; name: string; scrollY: SharedValue<number>; ghost: React.ReactNode; onBack: () => void;
  /** a hall pushed from a dish's where-served: the day and meal to open on, and the dish to land on */
  at?: ServeTarget;
  /** where-served to another place or day: the screen above pushes it */
  onPush?: (t: ServeTarget) => void;
  /** the sheet that asked for that push is half-way out */
  onPushGo?: () => void;
  /** a pushed hall has drawn and scrolled to its dish (it is still out of sight until this is called) */
  onSettled?: () => void;
}) {
  const { width, height: winH } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const now = new Date(fx.clock);
  const { prefs, scores } = useBakeoffState();
  const compact = place.startsWith("c");
  const one = isOneMeal(fx, place);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- __DEV__ is a build-time constant
  const dev = __DEV__ ? useLocalSearchParams<{ day?: string; meal?: string; sheet?: string; y?: string; reveal?: string; dish?: string }>() : {};

  // one day for the list and the labels: a day change commits it once, while a copy of the old rows and the old labels stay on screen
  const [day, setDay] = useState(() => at?.day ?? (+(dev.day ?? 0) || 0));
  // the labels as they were before a day change (null: they are the current ones)
  const [held, setHeld] = useState<Labels | null>(null);
  const [mealSel, setMealSel] = useState<MealKey>(at?.meal ?? (dev.meal as MealKey) ?? "lunch");
  const [showAll, setShowAll] = useState(() => !at && dev.reveal === "1");
  // the dish a where-served button (or the dev entry) is bringing up: scrolled to once the list has it, revealed first if preferences hide it
  const [goto, setGoto] = useState<string | null>(at?.dish ?? null);
  const [sheet, setSheet] = useState<"hours" | "stations" | null>(null);
  const [cur, setCur] = useState(0);
  // the container opens before the list is drawn: mounting ~30 rows blocks JS, and the open's clock starts at the first layout
  // (a hall pushed to a dish is drawn out of sight, so it draws at once: its list must exist before it can be scrolled to the dish)
  const [warm, setWarm] = useState(!!at);
  useEffect(() => { if (at) return; const id = requestAnimationFrame(() => setWarm(true)); return () => cancelAnimationFrame(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // the row M2 brought the dish up to stays tinted (`.row.here`) until the next dish is brought up
  const [hereKey, setHereKey] = useState<string | null>(null);
  const meals = mealsOf(fx, isos[day], place);
  const meal = defaultMeal(fx, isos[day], place, mealSel);

  const view = useMemo(() => menuView(fx, isos[day], place, meal, prefs, showAll), [day, place, meal, prefs, showAll]);
  const items = useMemo(
    () => menuItems(view, prefs, showAll, meals.length ? "" : `No menu posted for ${dayFull(fx, day)}.`),
    [view, prefs, showAll, day, meals.length],
  );
  const heads = useMemo(() => items.flatMap((it, i) => (it.t === "head" ? [i] : [])), [items]);
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

  // ---- day change (M2 changeDay): what says the day fades out where it is, then the new day fades in (the list scaling up from .97).
  // The list and the labels commit once, under the old ones (the copy of the old rows, the old labels' layer); the fade out and back
  // in is then only shared values on the UI thread.
  const f = useSharedValue(1), sc = useSharedValue(1), lo = useSharedValue(0), ln = useSharedValue(1), holdOn = useSharedValue(1);
  const FT = m2Motion.fadeThrough, fade = standardDecelerate;
  const done = () => {
    pager.current?.release();
    setHeld(null);
  };
  const changeDay = (i: number) => {
    const keep = Math.min(y.get(), R);
    // refused (and nothing touched) while another change is running: see motion/pagerMachine
    pager.current?.hold(() => {
      holdOn.set(1);
      lo.set(1); ln.set(0);   // the old layer shows exactly what is on screen: until the commit lands it is the current labels
      setHeld(labels);
      setDay(i);
    }, () => {
      pager.current?.list()?.scrollToOffset({ offset: keep, animated: false });
      const out = FT.d * m2Motion.sharedX.at, back = FT.d * (1 - m2Motion.sharedX.at);
      lo.set(withTiming(0, { duration: out, easing: m2Linear }));
      sc.set(1);
      f.set(withSequence(
        withTiming(0, { duration: out, easing: m2Linear }, () => {
          "worklet";
          holdOn.set(0);
          sc.set(FT.scale);
          sc.set(withTiming(1, { duration: back, easing: fade }));
          ln.set(withTiming(1, { duration: back, easing: fade }));   // the labels come back in the same frame as the list
        }),
        withTiming(1, { duration: back, easing: fade }, () => { "worklet"; runOnJS(done)(); }),
      ));
    });
  };
  const newLabels = useAnimatedStyle(() => ({ opacity: ln.get() }));
  const oldLabelsStyle = useAnimatedStyle(() => ({ opacity: lo.get() }));
  const listFade = useAnimatedStyle(() => ({ opacity: f.get(), transform: [{ scale: sc.get() }], transformOrigin: `50% ${(H + PIN) / 2}px` }));

  // ---- meals
  const pickMeal = (m: MealKey) => {
    if (m === meal) return;
    const dir = Math.sign(meals.indexOf(m) - meals.indexOf(meal)) as 1 | -1;
    pager.current?.shift(dir, () => {
      tick();
      holdOn.set(1);
      setMealSel(m);
      requestAnimationFrame(() => { if (y.get() > R) pager.current?.list()?.scrollToOffset({ offset: R, animated: false }); });
    });
  };

  // ---- the dish sheet
  // one callback for every row, so a row never re-renders for it; the sheet reads the screen's current place, meal and day when it opens
  const here = useRef({ place, meal, day });
  const serve = useRef<(t: ServeTarget) => void>(() => {});
  const goRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    here.current = { place, meal, day };
    goRef.current = onPushGo;
    serve.current = (to) => {
      // inside this place and day the list just brings the dish up; anywhere else the screen above pushes that hall, already at the dish
      if (to.place === place && to.day === day) { if (to.meal !== meal) pickMeal(to.meal); setGoto(to.dish); }
      else onPush?.(to);
    };
  });
  const onOpen = useCallback((dish: Dish) => { openDish(dish, { from: "hall", ...here.current, onServe: (to) => serve.current(to), onServeGo: () => goRef.current?.() }); }, []);
  useEffect(() => {
    if (!goto || !warm) return;
    const i = items.findIndex((it) => it.t === "dish" && it.dish.key === goto);
    if (i >= 0) {
      // FlashList places a row it has not drawn yet from its estimated heights (scrollToIndex landed stations past the dish), so the
      // offset is taken from the row's layout, and again as each pass draws more of the list: the last lands on measured rows. A
      // pushed hall does this out of sight and only then reports `onSettled`, so it arrives already at the dish (M2 `toDish(id, true)`).
      let k = 0, last = -1, same = 0;
      const done = () => { refreshHeads(); setHereKey(goto); requestAnimationFrame(() => requestAnimationFrame(() => onSettled?.())); };
      const go = () => {
        const l = pager.current?.list();
        const lay = l?.getLayout(i);
        if (!l || !lay) { if (++k > 40) done(); else setTimeout(go, 40); return; }
        const off = Math.max(0, lay.y + l.getFirstItemOffset() - PIN - 8);
        // stable: the row is drawn and its layout has not moved over two passes (a pass that comes before the list has drawn
        // around the new offset computes the same estimate again, so one equal pass is not enough)
        const { startIndex, endIndex } = l.computeVisibleIndices();
        const drawn = i >= startIndex && i <= endIndex;
        same = Math.abs(off - last) < 1 && drawn ? same + 1 : 0;
        if (same >= 2 || ++k > 40) { done(); return; }
        last = off;
        l.scrollToOffset({ offset: off, animated: false });
        setTimeout(go, 40);
      };
      go();
      setGoto(null);
      return;
    }
    if (!showAll) setShowAll(true);
    else { setGoto(null); onSettled?.(); }
  }, [goto, items, warm, showAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- sheets
  const hoursRef = useRef<BottomSheetModal>(null), stRef = useRef<BottomSheetModal>(null);
  const pending = useRef<{ day: number } | null>(null);
  const sched = useMemo(() => schedule(fx, place, day), [place, day]);
  const openHours = () => { setSheet("hours"); hoursRef.current?.present(); thud(); };
  const openStations = () => { if (!view.sections.length) return; setSheet("stations"); stRef.current?.present(); thud(); };
  const onDismiss = () => {
    setSheet(null);
    const p = pending.current;
    pending.current = null;
    if (p?.day != null) changeDay(p.day);
  };
  useEffect(() => {
    if (!__DEV__ || at || !(dev.sheet || dev.y || dev.dish)) return;
    const id = setTimeout(() => {
      if (dev.y) pager.current?.list()?.scrollToOffset({ offset: +dev.y, animated: false });
      if (dev.sheet === "hours") openHours();
      if (dev.sheet === "stations") openStations();
      // `dish=<key>`: the dish sheet for a dish on this menu, as a row tap would open it
      const d = dev.dish && items.flatMap((it) => (it.t === "dish" ? [it.dish] : [])).find((x) => x.key === dev.dish);
      if (d) onOpen(d);
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

  const labels: Labels = {
    status, onStatus: status ? openHours : undefined,
    busy: busy ? <View style={{ opacity: live ? 1 : 0 }} pointerEvents="none"><BusyRow {...busy} header /></View> : undefined,
    board: live ? <Board columns={boardAt(fx.typical[place as "W"], fx.busy[place as "W"], now.getHours() * 60 + now.getMinutes())} /> : undefined,
    meals: one ? undefined : { items: mealItems, selected: meal, onSelect: (k) => pickMeal(k as MealKey) },
    station: stationLabel ? { label: stationLabel, onPress: openStations, open: sheet === "stations" } : undefined,
    day: { label: dayCell(fx, day), accessibilityLabel: `${dayFull(fx, day)}, change the day`, onPress: openHours },
  };

  const renderItem = (it: Item) => {
    switch (it.t) {
      case "note": return <DietLine line={it.line} revealed={it.revealed} onToggle={() => setShowAll((s) => !s)} />;
      case "head": return <View style={{ height: 50, paddingHorizontal: m2.space[4], paddingBottom: 6, justifyContent: "flex-end", backgroundColor: m2.color.chalk }}><Text v="stationHead" color={m2.color.dm} accessibilityRole="header">{it.name}</Text></View>;
      case "empty": return <View style={{ paddingHorizontal: m2.space[4], paddingTop: 28, paddingBottom: 8 }}><Text v="empty" color={m2.color.slate}>{it.text}</Text></View>;
      default: return <DishRow dish={it.dish} contains={it.contains} scores={scores} lane={day === 0} onOpen={onOpen} here={it.dish.key === hereKey} />;
    }
  };

  return (
    <View style={fill} pointerEvents="box-none">
      <Animated.View needsOffscreenAlphaCompositing style={[fill, { backgroundColor: m2.color.chalk }, t.style.incoming, listFade]}>
        {warm ? <MealPager
          ref={pager} data={items} renderItem={renderItem} animatedRef={aref} holdOn={holdOn} onScroll={onScroll} scrollY={y} onViewable={refreshHeads}
          keyOf={keyOf} typeOf={typeOf}
          header={<View style={{ height: HH + TH + SWH, backgroundColor: m2.color.dm }} />} footer={<View style={{ height: 120 }} />}
        /> : null}
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[{ position: "absolute", top: 0, left: 0, right: 0 }, headerTx]}>
        <Header
          title={name} top={top} height={HH}
          photo={src ? <Photo source={src} width={width} height={HH} pos={compact ? 0.5 : PHOTO_POS[place as "W"]} duo={t.style.photo} /> : undefined}
          letter={<>
            {hallLetter ? <Animated.View pointerEvents="none" style={[fill, t.style.incoming]}>{hallLetter}</Animated.View> : null}
            {ghost}
          </>}
          labels={labels} oldLabels={held ?? labels} newStyle={newLabels} oldStyle={oldLabelsStyle}
          gradStyle={t.style.grad} contentStyle={t.style.incoming} collapse={c}
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
