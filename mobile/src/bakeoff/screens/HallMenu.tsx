import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, {
  runOnJS, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import { BackButton, Board, BusyRow, HallLetter, Header, Photo, thud, tick } from "../ui";
import type { Labels } from "../ui/Header";
import { BAR } from "../ui/Header";
import { boardAt, busyView } from "../logic/busy";
import { MEAL_LABEL, loadFixture } from "../logic/fixture";
import { plateMeal } from "../logic/plate";
import { dayCell, dayFull, dayIsos, defaultMeal, hasMenu, isOneMeal, mealsOf, menuItems, menuView, type Item, type MenuView } from "../logic/menuView";
import { eventOn, schedule, statusLine } from "../logic/schedule";
import type { ServeTarget } from "../logic/dishSheet";
import type { Dish, MealKey, PlaceKey } from "../logic/types";
import { openDish } from "../state/dishSheet";
import type { useContainerTransform } from "../motion/useContainerTransform";
import { PHOTO_POS, photoOf } from "../photos";
import { hoursKnown, liveKnown, useMenuState, useNet } from "../state/net";
import { add, useStore } from "../state/store";
import { useArrival } from "../ui/arrive";
import { timed, useMotion } from "../ui/motion";
import { mark } from "../perf";
import { goToStation } from "../motion/stationJump";
import { MenuList, MenuSlice } from "./MenuList";
import { useDayChange } from "./useDayChange";
import { useLanding } from "./useLanding";
import { headerHeight } from "./HallsList";
import { HoursSheet } from "./HoursSheet";
import type { PagerHandle } from "./MealPager";
import { StationSwitcher } from "./StationSwitcher";

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
const clamp = (x: number) => {
  "worklet";
  return Math.min(1, Math.max(0, x));
};

// one fixture for the screen: a stable object, so the memos below depend only on what changes
const fx = loadFixture();
const isos = dayIsos(fx);

const NONE: MenuView = { sections: [], hidden: 0, line: null };

const mealWord = (m: MealKey) => (m === "grab" ? "Grab 'N Go" : MEAL_LABEL[m].toLowerCase());

/**
 * The hall (or café) screen the container transform opens into. The photo, letter and name are written once per place and
 * never re-render or fade on a day change; what says the day (status, busy, tab and station labels, the list) fades through.
 * `ghost` is the band's copy that rides on the photo while the container opens.
 */
export function HallMenu({ t, H, place, name, scrollY, ghost, onBack, at, onPush, onPushGo, onSettled, onEvent }: {
  t: ReturnType<typeof useContainerTransform>; H: number; place: PlaceKey; name: string; scrollY: SharedValue<number>; ghost: React.ReactNode; onBack: () => void;
  /** a hall pushed from a dish's where-served: the day and meal to open on, and the dish to land on */
  at?: ServeTarget;
  /** where-served to another place or day: the screen above pushes it */
  onPush?: (t: ServeTarget) => void;
  /** the sheet that asked for that push is half-way out */
  onPushGo?: () => void;
  /** a pushed hall has drawn and scrolled to its dish (it is still out of sight until this is called) */
  onSettled?: () => void;
  /** the holiday note on this day's list opens its event page (the screen above pushes it) */
  onEvent?: (i: number) => void;
}) {
  const { width, height: winH } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const prefs = useStore((s) => s.prefs);
  const scores = useStore((s) => s.show);
  const compact = place.startsWith("c");
  // a café that lists no dishes has no pinned rows, only what it is (M2 `nomenu`)
  const nomenu = compact && !hasMenu(fx, place);
  const one = isOneMeal(fx, place);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- __DEV__ is a build-time constant
  const dev = __DEV__ ? useLocalSearchParams<{ day?: string; meal?: string; sheet?: string; y?: string; reveal?: string; dish?: string }>() : {};

  // one day for the list and the labels: a day change commits it once, while a copy of the old rows and the old labels stay on screen
  const [day, setDay] = useState(() => at?.day ?? (+(dev.day ?? 0) || 0));
  const [mealSel, setMealSel] = useState<MealKey>(at?.meal ?? (dev.meal as MealKey) ?? "lunch");
  const [showAll, setShowAll] = useState(() => !at && dev.reveal === "1");
  const [sheet, setSheet] = useState<"hours" | "stations" | null>(null);
  const [cur, setCur] = useState(0);
  // The list and the two sheets mount once the container has settled open: mounting ~30 rows inside the 500 ms put a UI-thread commit under the
  // animation (a Galaxy A53 trace: the open's frames came late and the curve was at .91 by its second). They fade in as they arrive; M2 holds
  // the list's own content invisible over the first 30% of the open anyway (`paint`'s `fin`). Pre-mounting before the tap would cost four lists
  // on every Halls render. A hall pushed to a dish is drawn out of sight, so it draws at once: its list must exist before it can be scrolled to the dish.
  const [warm, setWarm] = useState(!!at || t.phase === "open");
  if (!warm && t.phase === "open") setWarm(true);
  // while it opens, the first rows are a static slice behind the (not yet mounted) list; the list reports its first rows and the slice goes
  const [sliceOn] = useState(!(at || t.phase === "open"));
  const [listUp, setListUp] = useState(false);
  // the network (M2 `menuState`, `hoursKnown`, `liveKnown`): the menu for this place and day may be loading, unsaved offline, or failed; then
  // there are no meals, no stations and no list, but the day cell, the name and the status line keep their rooms
  const net = useNet(), hk = hoursKnown(net), lk = liveKnown(net);
  const netState = useMenuState(place, day);
  const state = nomenu ? "ok" : netState;
  const okArrive = useArrival(state === "ok");
  const meals = useMemo(() => (state === "ok" ? mealsOf(fx, isos[day], place) : []), [state, day, place]);
  const meal = defaultMeal(fx, isos[day], place, mealSel);
  // perf marks (no-ops unless EXPO_PUBLIC_PERF=1): the render that carries a new day, and its commit
  const dayWas = useRef(day);
  // eslint-disable-next-line react-hooks/refs -- a timing probe, not state
  if (dayWas.current !== day) { dayWas.current = day; mark("day:render"); }
  useLayoutEffect(() => { mark("day:layout"); requestAnimationFrame(() => mark("day:frame1")); }, [day]);

  const rowMeal = useMemo(() => plateMeal(place, meal, new Date(fx.clock)), [place, meal]);
  const view = useMemo(() => (state === "ok" ? menuView(fx, isos[day], place, meal, prefs, showAll) : NONE), [state, day, place, meal, prefs, showAll]);
  const items = useMemo((): Item[] => {
    if (nomenu) return [{ t: "cafe", name, description: fx.places.find((p) => p.key === place)!.description }];
    if (state !== "ok") return [];
    // the holiday's note leads its own day's list (M2: events first, then the diet line), but only where a menu is posted
    const notes = meals.includes(meal) ? fx.events.flatMap((e, i): Item[] => (eventOn(fx, e, place, day) ? [{ t: "event", i, title: e.title }] : [])) : [];
    return [...notes, ...menuItems(view, prefs, showAll, meals.length ? "" : `No menu posted for ${dayFull(fx, day)}.`)];
  }, [nomenu, state, view, prefs, showAll, day, meals, meal, place, name]);
  const heads = useMemo(() => items.flatMap((it, i) => (it.t === "head" ? [i] : [])), [items]);
  const stationLabel = view.sections[Math.min(cur, view.sections.length - 1)]?.name ?? "";

  // ---- geometry: M2 HH, CH, TH, SWH, PIN
  const HH = headerHeight(top), R = HH - top - BAR;
  const TH = one || nomenu ? 0 : m2.size.tabs, SWH = nomenu ? 0 : m2.size.tabs, PIN = top + BAR + TH + SWH;
  const y = scrollY;
  const c = useDerivedValue(() => clamp(y.get() / R));
  const pager = useRef<PagerHandle>(null);
  const aref = useAnimatedRef<any>();
  const headY = useSharedValue<number[]>([]);
  const jump = useSharedValue(-1);
  const { reduced } = useMotion();

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
    goToStation(reduced, y.get(), target, {
      set: (to) => pager.current?.list()?.scrollToOffset({ offset: to, animated: false }),
      travel: (from, to) => { jump.set(from); jump.set(timed(to, m2Motion.scroll, (done) => { "worklet"; if (done) jump.set(-1); })); },
    });
    tick();
  };

  const dc = useDayChange({ pager, y, R, origin: (H + PIN) / 2, setDay });
  const { holdOn, newLabels, oldLabelsStyle, listFade, held } = dc;
  const { setGoto, hereKey } = useLanding({ at, items, warm, showAll, setShowAll, pager, refreshHeads, pin: PIN, onSettled });

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
  const onOpen = useCallback((dish: Dish) => {
    mark("sheet:tap");
    const h = here.current, pm = plateMeal(h.place, h.meal, new Date(fx.clock));
    openDish(dish, { from: "hall", ...h, onAdd: () => add(pm, dish.name, { [h.place]: dish }), onServe: (to) => serve.current(to), onServeGo: () => goRef.current?.() });
  }, []);
  // ---- sheets
  const hoursRef = useRef<BottomSheetModal>(null), stRef = useRef<BottomSheetModal>(null);
  const sched = useMemo(() => schedule(fx, place, day, { mode: net.mode, hours: hk }), [place, day, net.mode, hk]);
  const openHours = () => { setSheet("hours"); hoursRef.current?.present(); thud(); };
  const openStations = () => { if (!view.sections.length) return; setSheet("stations"); stRef.current?.present(); thud(); };
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
  const live = !compact && day === 0 && lk;
  const hallLetter = compact ? null : <HallLetter letter={place as "W"} top={top + 26} />;
  // hours are cached for the day: today's status needs only them, another day's span needs its menu too
  const status = hk && (day === 0 || state === "ok") ? statusLine(fx, place, day) : "";
  const mealItems = meals.map((m) => ({ key: m, label: MEAL_LABEL[m] }));

  // the board is one element for as long as it is live at this place: the header renders more often than the busy data changes
  const board = useMemo(() => (live ? <Board columns={boardAt(fx.typical[place as "W"], fx.busy[place as "W"], new Date(fx.clock).getHours() * 60 + new Date(fx.clock).getMinutes())} /> : undefined), [live, place]);
  const labels: Labels = {
    status, onStatus: status ? openHours : undefined,
    // the busy row keeps its room when it has no live data (another day, offline, loading), so the name never moves
    busy: busy ? (live
      ? <View pointerEvents="none"><BusyRow {...busy} header /></View>
      : <View style={{ opacity: 0 }} pointerEvents="none"><BusyRow {...busy} header /></View>) : undefined,
    board,
    meals: one || nomenu ? undefined : { items: mealItems, selected: meal, onSelect: (k) => pickMeal(k as MealKey) },
    station: stationLabel ? { label: stationLabel, onPress: openStations, open: sheet === "stations" } : undefined,
    day: nomenu ? undefined : { label: dayCell(fx, day), accessibilityLabel: `${dayFull(fx, day)}, change the day`, onPress: openHours },
    arrive: { menu: okArrive },
  };

  useEffect(() => { dc.track(labels); });
  const onDismiss = () => {
    mark("day:dismissed");
    setSheet(null);
  };

  const onListViewable = () => { refreshHeads(); setListUp(true); };
  const onToggleAll = useCallback(() => setShowAll((v) => !v), []);
  const row = useMemo(() => ({ scores, day, place, meal: rowMeal, onOpen, hereKey, onToggleAll, onEvent }), [scores, day, place, rowMeal, onOpen, hereKey, onToggleAll, onEvent]);

  // M2 `renderMenuList`: what the list says instead of a menu
  const stateText = state === "offline" ? `You're offline, and the menu for ${dayFull(fx, day)} isn't saved on this phone.`
    : `${name}'s menu${day ? " for " + dayFull(fx, day) : ""} didn't load.`;

  return (
    <View style={fill} pointerEvents="box-none">
      <Animated.View needsOffscreenAlphaCompositing style={[fill, { backgroundColor: m2.color.chalk }, t.style.incoming, listFade]}>
        {sliceOn && !listUp ? <MenuSlice items={items} row={row} head={HH + TH + SWH} height={H} /> : null}
        {warm ? <MenuList
          ref={pager} items={items} animatedRef={aref} holdOn={holdOn} onScroll={onScroll} scrollY={y} onViewable={onListViewable}
          state={state} stateText={stateText} head={HH + TH + SWH}
          row={row}
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
          labels={labels} oldLabels={held} newStyle={newLabels} oldStyle={oldLabelsStyle}
          gradStyle={t.style.grad} contentStyle={t.style.incoming} collapse={c}
        />
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[{ position: "absolute", top, left: m2.space.line, height: BAR, justifyContent: "center" }, t.style.incoming]}>
        <BackButton onPress={onBack} />
      </Animated.View>
      {warm ? <HoursSheet ref={hoursRef} s={sched} maxHeight={winH * 0.86} onPick={(i) => dc.pickDay(i, day, () => hoursRef.current?.dismiss())} onDismiss={onDismiss} /> : null}
      {warm ? <StationSwitcher
        ref={stRef} maxHeight={winH * 0.86} onDismiss={onDismiss} current={Math.min(cur, view.sections.length - 1)}
        title={`${name} ${mealWord(meal)}${day ? ", " + dayCell(fx, day) : ""}`}
        stations={view.sections.map((s) => ({ name: s.name, count: s.dishes.length }))}
        onPick={(si) => { stRef.current?.dismiss(); jumpTo(si); }}
      /> : null}
    </View>
  );
}
