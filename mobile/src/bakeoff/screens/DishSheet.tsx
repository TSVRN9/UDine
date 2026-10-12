import { useEffect, useRef, useState, type ReactElement } from "react";
import { BackHandler, View, useWindowDimensions } from "react-native";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion, m2SettleEasing } from "../../lib/motion";
import { GRAB, Press, ScoreBadge, ScrollEdge, Sheet, SheetMark, Text } from "../ui";
import { labelRows, restingSnap, sheetMarks, sheetPrice, type DishCtx, type ServeTarget } from "../logic/dishSheet";
import type { Dish } from "../logic/types";
import { useBakeoffState, type Toggles } from "../state/prefs";
import { closeDish, useOpenDish } from "../state/dishSheet";
import { NutritionLabel } from "./NutritionLabel";
import { RatingsPanel } from "./RatingsPanel";
import { WhereServed } from "./WhereServed";

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
function parts({ dish, ctx, scores, avoid, edge, onServe, onCalBottom }: {
  dish: Dish; ctx: DishCtx; scores: Toggles; avoid: string[]; edge: Parameters<typeof ScrollEdge>[0]["on"];
  onServe: (t: ServeTarget) => void; onCalBottom?: (y: number) => void;
}): ReactElement[] {
  const price = sheetPrice(ctx, dish), mk = sheetMarks(dish, scores);
  return [
    <View key="name" style={{ marginHorizontal: -m2.space[4], paddingHorizontal: m2.space[4], paddingBottom: 4, marginBottom: -4, backgroundColor: m2.color.chalk }}>
      <Text v="dishName" color={m2.color.dm} accessibilityRole="header" style={{ marginTop: 4 }}>{dish.name}</Text>
      <ScrollEdge on={edge} room={Math.ceil(m2.type.dishName.size * 0.3)} />
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
    <WhereServed key="where" dish={dish} onServe={onServe} />,
    <NutritionLabel key="label" label={labelRows(dish.nutrition, dish.cal, dish.serving)} onCalBottom={onCalBottom} />,
    <RatingsPanel key="ratings" health={dish.health} carbon={dish.carbon} />,
    dish.ingredients ? <Ingredients key="ing" text={dish.ingredients} /> : <View key="ing" />,
  ];
}

/** One open dish sheet: measured off-screen first (its resting height depends on the dish), then presented at that height. */
function DishSheetView({ dish, ctx }: { dish: Dish; ctx: DishCtx }) {
  const { width, height: winH } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const { scores, prefs } = useBakeoffState();
  const ref = useRef<BottomSheetModal>(null);
  const [rest, setRest] = useState<number | null>(null);
  const edge = useSharedValue(0), pos = useSharedValue(winH), serving = useSharedValue(false);
  const target = useRef<ServeTarget | null>(null);
  const full = winH - top - 8;

  // the where-served button: the sheet goes down, and once it is half-way out the destination starts (M2 `isheet.away`); the
  // sheet's end is the fallback. One tap only: a second, during the rise or the leave, does nothing.
  const fire = () => { const t = target.current; target.current = null; if (t) ctx.onServe?.(t); };
  const serve = (t: ServeTarget) => {
    if (serving.get()) return;
    serving.set(true);
    target.current = t;
    ref.current?.dismiss();
  };
  useAnimatedReaction(() => serving.get() && pos.get() > winH - (rest ?? 0) / 2, (hit, was) => { if (hit && !was) runOnJS(fire)(); });

  useEffect(() => { if (rest != null) ref.current?.present(); }, [rest]);
  useEffect(() => {
    if (rest == null) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { ref.current?.dismiss(); return true; });
    return () => sub.remove();
  }, [rest]);

  // `serve` reaches the sheet's ref only when a button is tapped, never while rendering
  // eslint-disable-next-line react-hooks/refs
  const content = parts({ dish, ctx, scores, avoid: prefs.avoid, edge, onServe: serve, onCalBottom: rest == null ? (y) => setRest((r) => r ?? restingSnap({ calBottom: y, grab: GRAB, winH, top })) : undefined });
  if (rest == null) {
    return <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, width, opacity: 0, paddingHorizontal: m2.space[4] }}>{content}</View>;
  }
  return (
    <Sheet ref={ref} maxHeight={full} snapPoints={rest < full - 4 ? [rest, full] : [full]} animatedPosition={pos} sticky
      onScrollY={(y) => edge.set(y > 4 ? 1 : 0)} onDismiss={() => { fire(); closeDish(); }}>
      {content}
    </Sheet>
  );
}

/** Mounted once, above the screens that open a dish. */
export function DishSheetHost() {
  const open = useOpenDish();
  return open ? <DishSheetView key={open.seq} dish={open.dish} ctx={open.ctx} /> : null;
}
