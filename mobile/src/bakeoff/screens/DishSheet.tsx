import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { BackHandler, View, useWindowDimensions } from "react-native";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion, m2SettleEasing } from "../../lib/motion";
import { GRAB, Press, ScoreBadge, ScrollEdge, Sheet, SheetMark, Text } from "../ui";
import { estimateCalBottom, labelRows, restingSnap, sheetMarks, sheetPrice, type DishCtx, type ServeTarget } from "../logic/dishSheet";
import type { Dish } from "../logic/types";
import { useBakeoffState, type Toggles } from "../state/prefs";
import { closeDish, useOpenDish } from "../state/dishSheet";
import { mark } from "../perf";
import { NutritionLabel } from "./NutritionLabel";
import { RatingsPanel } from "./RatingsPanel";
import { WhereServed } from "./WhereServed";
import { whereAnswer, type WhereGroup } from "../logic/where";
import { isCafe, loadFixture, placeName } from "../logic/fixture";

const bold = { fontFamily: m2.font.bodySb } as const;
const LINES = 3;

/** M2 `.ing`: three lines and a fade, "Show all" only when the text is actually cut (measured, not counted). */
function Ingredients({ text }: { text: string }) {
  const full = useSharedValue(0), open = useSharedValue(0), cut = useSharedValue(0);
  const [measured, setMeasured] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const closed = m2.type.ing.line * LINES;
  const truncated = measured != null && measured > closed + 1;
  const box = useAnimatedStyle(() => (cut.get() ? { height: closed + (full.get() - closed) * open.get() } : {}));
  const fade = useAnimatedStyle(() => ({ opacity: 1 - open.get() }));
  const toggle = () => {
    const to = expanded ? 0 : 1;
    setExpanded(!expanded);
    open.set(withTiming(to, { duration: m2Motion.settle.d, easing: m2SettleEasing }));
  };
  return (
    <>
      <Text v="sheetHead" color={m2.color.dm} style={{ marginTop: m2.space[5], marginBottom: m2.space[1] }}>Ingredients</Text>
      <Animated.View style={[{ overflow: "hidden" }, truncated ? box : null]}>
        <Text v="ing" color={m2.color.ink} onLayout={(e) => { const h = e.nativeEvent.layout.height; full.set(h); cut.set(h > closed + 1 ? 1 : 0); setMeasured(h); }}>{text}</Text>
        {truncated ? (
          <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: closed - m2.type.ing.line, height: m2.type.ing.line }, fade]}>
            <Svg width="100%" height={m2.type.ing.line}>
              <Defs><LinearGradient id="ingfade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={m2.color.chalk} stopOpacity={0} /><Stop offset="1" stopColor={m2.color.chalk} stopOpacity={1} /></LinearGradient></Defs>
              <Rect x={0} y={0} width="100%" height="100%" fill="url(#ingfade)" />
            </Svg>
          </Animated.View>
        ) : null}
      </Animated.View>
      {truncated ? (
        <Press accessibilityRole="button" accessibilityState={{ expanded }} onPress={toggle} style={{ height: 40, justifyContent: "center", alignSelf: "flex-start", marginTop: 2 }}>
          <Text v="link" color={m2.color.vm}>{expanded ? "Show less" : "Show all"}</Text>
        </Press>
      ) : null}
    </>
  );
}

/** The sheet's content as the scroll's direct children (the first, the name, is pinned). Both the sheet and its off-screen measuring copy draw it. */
function parts({ dish, ctx, answer, scores, avoid, edge, onServe, onCalBottom }: {
  dish: Dish; ctx: DishCtx; answer: WhereGroup[]; scores: Toggles; avoid: string[]; edge: Parameters<typeof ScrollEdge>[0]["on"];
  onServe: (t: ServeTarget) => void; onCalBottom?: (y: number) => void;
}): ReactElement[] {
  const price = sheetPrice(ctx, dish), mk = sheetMarks(dish, scores);
  return [
    <View key="name" style={{ marginHorizontal: -m2.space[4], paddingHorizontal: m2.space[4], paddingBottom: 4, marginBottom: -4, backgroundColor: m2.color.chalk }}>
      {/* first, so the name's descenders draw over the edge's fill */}
      <ScrollEdge on={edge} room={Math.ceil(m2.type.dishName.size * 0.3)} />
      <Text v="dishName" color={m2.color.dm} accessibilityRole="header" style={{ marginTop: 4 }}>{dish.name}</Text>
    </View>,
    price || dish.serving ? (
      <View key="serving" style={{ flexDirection: "row", alignItems: "baseline", marginTop: 4 }}>
        {price ? <Text v="price" color={m2.color.ink} style={{ marginRight: m2.space[1] }}>{price}</Text> : null}
        {dish.serving ? <Text v="date" color={m2.color.slate} style={{ flexShrink: 1 }}>{dish.serving}</Text> : null}
      </View>
    ) : <View key="serving" />,
    mk ? (
      <View key="marks" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: m2.space[1], marginTop: m2.space[1] }}>
        {mk.marks.map((k) => <SheetMark key={k} kind={k} />)}
        {mk.health != null || mk.carbon != null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: m2.space[1], height: 30 }}>
            <ScoreBadge kind="health" value={mk.health} size="sheet" />
            <ScoreBadge kind="carbon" value={mk.carbon} size="sheet" />
          </View>
        ) : null}
      </View>
    ) : <View key="marks" />,
    dish.allergens.length ? (
      <Text key="contains" v="lbl" color={m2.color.ink} style={{ marginTop: m2.space[1] }}>
        <Text v="lbl" color={m2.color.dm} style={bold}>{"Contains "}</Text>
        {dish.allergens.map((a, i) => (
          <Text key={a} v="lbl" color={avoid.includes(a) ? m2.color.vm : m2.color.ink} style={avoid.includes(a) ? bold : null}>{(i ? ", " : "") + a}</Text>
        ))}
      </Text>
    ) : <View key="contains" />,
    ctx.day === 0 ? (
      <Press key="add" accessibilityRole="button" onPress={ctx.onAdd}
        style={{ marginTop: m2.space[3], height: 52, borderRadius: m2.radius.button, backgroundColor: m2.color.vm, alignItems: "center", justifyContent: "center" }}>
        <Text v="action" color={m2.color.white}>Add to plate</Text>
      </Press>
    ) : <View key="add" />,
    <WhereServed key="where" dish={dish} answer={answer} onServe={onServe} />,
    <NutritionLabel key="label" label={labelRows(dish.nutrition, dish.cal, dish.serving)} onCalBottom={onCalBottom} />,
    <RatingsPanel key="ratings" health={dish.health} carbon={dish.carbon} />,
    dish.ingredients ? <Ingredients key="ing" text={dish.ingredients} /> : <View key="ing" />,
  ];
}

const fx = loadFixture();

/**
 * One open dish sheet. It is presented the moment it is opened, at a resting height estimated from the dish alone; the real
 * content reports where its Calories rule ends and the snap retargets while the sheet is still rising (M2 measures per dish too, but
 * synchronously). Drawing the content off-screen first, to measure it, cost about 0.7 s between the tap and the first movement.
 */
function DishSheetView({ dish, ctx }: { dish: Dish; ctx: DishCtx }) {
  const { width, height: winH } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const { scores, prefs } = useBakeoffState();
  const ref = useRef<BottomSheetModal>(null);
  const answer = useMemo(() => whereAnswer(fx, dish.name, new Date(fx.clock)), [dish]);
  const full = winH - top - 8;
  const [rest, setRest] = useState(() => restingSnap({
    calBottom: estimateCalBottom(dish, {
      width, price: !!sheetPrice(ctx, dish), add: ctx.day === 0, health: scores.health && dish.health != null, carbon: scores.carbon && dish.carbon != null,
      where: answer.map((g) => ({ chips: g.halls.map((h) => placeName(h).length), letters: g.halls.map((h) => !isCafe(h)) })),
    }),
    grab: GRAB, winH, top,
  }));
  const edge = useSharedValue(0), pos = useSharedValue(winH), serving = useSharedValue(false);
  const went = useRef(false);
  const snaps = useMemo(() => (rest < full - 4 ? [rest, full] : [full]), [rest, full]);

  // the where-served button: the destination is prepared at once (it mounts and settles out of sight while the sheet goes down), and
  // once the sheet is half-way out it moves (M2 `isheet.away`); the sheet's end is the fallback. One tap only: a second, during the
  // rise or the leave, does nothing.
  const go = () => { if (went.current) return; went.current = true; ctx.onServeGo?.(); };
  const serve = (t: ServeTarget) => {
    if (serving.get()) return;
    serving.set(true);
    ctx.onServe?.(t);
    ref.current?.dismiss();
  };
  useAnimatedReaction(() => serving.get() && pos.get() > winH - rest / 2, (hit, was) => { if (hit && !was) runOnJS(go)(); });

  mark("sheet:render");
  useLayoutEffect(() => { mark("sheet:layout"); });
  useEffect(() => { mark("sheet:present"); ref.current?.present(); }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { ref.current?.dismiss(); return true; });
    return () => sub.remove();
  }, []);

  // `serve` reaches the sheet's ref only when a button is tapped, never while rendering
  // eslint-disable-next-line react-hooks/refs
  const content = parts({ dish, ctx, answer, scores, avoid: prefs.avoid, edge, onServe: serve, onCalBottom: (y) => { mark("sheet:calBottom"); setRest(restingSnap({ calBottom: y, grab: GRAB, winH, top })); } });
  return (
    <Sheet ref={ref} maxHeight={full} snapPoints={snaps} animatedPosition={pos} sticky
      onAnimate={(from, to) => mark(`sheet:animate ${from}>${to}`)} onChange={(i) => mark(`sheet:index ${i}`)}
      onScrollY={(y) => edge.set(y > 4 ? 1 : 0)} onDismiss={() => { go(); closeDish(); }}>
      {content}
    </Sheet>
  );
}

/** Mounted once, above the screens that open a dish. */
export function DishSheetHost() {
  const open = useOpenDish();
  return open ? <DishSheetView key={open.seq} dish={open.dish} ctx={open.ctx} /> : null;
}
