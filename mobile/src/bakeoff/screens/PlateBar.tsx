import { useEffect, useMemo, useState, type RefObject } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import type BottomSheet from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion, m2SettleEasing } from "../../lib/motion";
import { Press, Text, ding, tick } from "../ui";
import { timed } from "../ui/motion";
import { fc } from "../logic/dishSheet";
import { placeName } from "../logic/fixture";
import { fq, plateHalls, plateLabel, totals, type Plate } from "../logic/plate";
import type { PlaceKey } from "../logic/types";
import { dropReceipt, getState, log, setFront, useStore } from "../state/store";
import { LogReceipt } from "./LogReceipt";

/** M2 `#bar .in`: min-height 68. The collapsed sheet is exactly this tall. */
export const BAR = 68;
const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
const nItems = (n: number) => (n === 1 ? "1 item" : `${fq(n)} items`);

function PlateLine({ plate, onLog, onOpen }: { plate: Plate; onLog: () => void; onOpen: () => void }) {
  const t = totals(plate);
  return (
    <>
      <Press feedback="tint" accessibilityRole="button" accessibilityLabel="Open the plate" onPress={onOpen} style={{ flex: 1, minWidth: 0, justifyContent: "center", height: BAR }}>
        <Text v="meta" color={m2.color.onDm} numberOfLines={1}>{`${plateLabel(plate)}, ${nItems(t.n)}`}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 2 }}>
          <Text v="barNum" color={m2.color.white} style={{ marginRight: 2 }}>{fc(t.cal)}</Text>
          <Text v="meta" color={m2.color.onDm} style={{ marginRight: m2.space.panel }}>cal</Text>
          <Text v="barNum" color={m2.color.white} style={{ marginRight: 2 }}>{`${f1(t.p)}g`}</Text>
          <Text v="meta" color={m2.color.onDm}>protein</Text>
        </View>
      </Press>
      <Press accessibilityRole="button" onPress={onLog} style={{ height: 48, minWidth: 84, paddingHorizontal: 18, borderRadius: m2.radius.button, backgroundColor: m2.color.gold, alignItems: "center", justifyContent: "center" }}>
        <Text v="button" color={m2.color.dm}>Log</Text>
      </Press>
    </>
  );
}

/** M2's `choose` mode: a plate several places serve says where it is logged. */
function Choose({ halls, onPick, onBack }: { halls: PlaceKey[]; onPick: (h: PlaceKey) => void; onBack: () => void }) {
  return (
    <>
      <Press feedback="tint" accessibilityRole="button" onPress={onBack} style={{ minHeight: 48, justifyContent: "center", paddingRight: m2.space.panel }}>
        <Text v="meta" color={m2.color.onDm}>Log at</Text>
      </Press>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: m2.space.part }}>
        {halls.map((h) => (
          <Press key={h} accessibilityRole="button" onPress={() => onPick(h)} style={{ height: 48, flexShrink: 1, paddingHorizontal: 14, borderRadius: m2.radius.button, backgroundColor: m2.color.gold, alignItems: "center", justifyContent: "center" }}>
            <Text v="button" color={m2.color.dm} numberOfLines={1}>{placeName(h)}</Text>
          </Press>
        ))}
      </View>
    </>
  );
}

/**
 * M2's plate bar, drawn as the plate sheet's handle: the sheet is the bar grown taller. A tap opens it to mid, a drag up is gorhom's, and
 * a sideways swipe switches plates (dots show there are several, a felt strip peeks over the next). Log crossfades into a receipt with
 * Undo and the receipt crossfades back; every one of those reads the store when it fires, never what was drawn when the finger went down.
 */
export function PlateBar({ sheet, animatedIndex, collapse }: { sheet: RefObject<BottomSheet | null>; animatedIndex: SharedValue<number>; collapse: () => void }) {
  const count = useStore((s) => s.plates.plates.length);
  const front = useStore((s) => s.plates.front);
  const last = useStore((s) => s.last);
  const front0 = useStore((s) => s.plates.plates[s.plates.front]);
  // the last plate stays drawn while the bar slides away after it is emptied or logged (M2 leaves the bar's content as it was)
  const [held, setHeld] = useState<Plate | undefined>(front0);
  if (front0 && front0 !== held) setHeld(front0);
  else if (last && held && !front0) setHeld(undefined);   // a logged plate is not held: the receipt replaced it
  const shown = front0 ?? held;
  const halls = useMemo(() => (front0 ? plateHalls(front0) : null), [front0]);
  // the plate the question is asked of: another plate in front is another question
  const frontId = useStore((s) => s.plates.plates[s.plates.front]?.id ?? null);
  const [chooseFor, setChooseFor] = useState<number | null>(null);
  const mode = last ? "logged" : chooseFor === frontId && halls && halls.length > 1 ? "choose" : "plate";

  // the receipt stays a while, then the bar goes back to the plate (or away, with none left)
  useEffect(() => {
    if (!last) return;
    const id = setTimeout(dropReceipt, m2Motion.receipt.d);
    return () => clearTimeout(id);
  }, [last]);
  const doLog = (at?: PlaceKey) => {
    setChooseFor(null);
    log(at);
    ding();
    collapse();
  };
  const onLog = () => { if (halls && halls.length > 1) setChooseFor(frontId); else doLog(); };
  const onOpen = () => { if (animatedIndex.get() < 0.5) sheet.current?.snapToIndex(1); };

  // sideways: the content follows the finger (a single plate resists), and past `commit` dp or `flick` px/ms it is the next plate
  const tx = useSharedValue(0), op = useSharedValue(1);
  const switchTo = (dir: 1 | -1) => {
    const { plates } = getState().plates;
    if (plates.length < 2) return;
    setFront((getState().plates.front + dir + plates.length) % plates.length);
    tick();
    tx.set(dir * m2Motion.plateSwipe.shift); op.set(0);
    tx.set(timed(0, m2Motion.settle)); op.set(timed(1, m2Motion.settle));
  };
  const pan = Gesture.Pan()
    .enabled(mode === "plate")
    .activeOffsetX([-12, 12]).failOffsetY([-8, 8])
    .onUpdate((e) => {
      if (animatedIndex.get() > 0.05) return;
      tx.set(count > 1 ? e.translationX : e.translationX * m2Motion.plateSwipe.rubber);
    })
    .onEnd((e) => {
      if (animatedIndex.get() > 0.05) { tx.set(timed(0, m2Motion.settle)); return; }
      if (count > 1 && (Math.abs(e.translationX) > m2Motion.plateSwipe.commit || Math.abs(e.velocityX) / 1000 > m2Motion.plateSwipe.flick)) {
        runOnJS(switchTo)(e.translationX < 0 ? 1 : -1);
      } else tx.set(timed(0, m2Motion.settle));
    })
    .onFinalize((_e, ok) => { if (!ok) tx.set(timed(0, m2Motion.settle)); });
  const slide = useAnimatedStyle(() => ({ opacity: op.get(), transform: [{ translateX: tx.get() }] }));

  return (
    <View style={{ height: BAR, backgroundColor: m2.color.dm }}>
      {count > 1 && mode === "plate" ? (
        <>
          <View pointerEvents="none" style={{ position: "absolute", left: 10, right: 10, top: -5, height: 5, backgroundColor: m2.color.felt, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 5, flexDirection: "row", justifyContent: "center", gap: 5 }}>
            {Array.from({ length: count }, (_, i) => <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: i === front ? m2.color.gold : m2.color.dotOff }} />)}
          </View>
        </>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View key={mode} entering={FadeIn.duration(m2Motion.settle.d).easing(m2SettleEasing)} style={{ flex: 1 }}>
          <Animated.View style={[{ flex: 1, flexDirection: "row", alignItems: "center", gap: m2.space.panel, paddingLeft: m2.space.gutter, paddingRight: m2.space.panel }, mode === "plate" ? slide : null]}>
            {mode === "logged" && last ? <LogReceipt last={last} />
              : mode === "choose" && halls ? <Choose halls={halls} onPick={doLog} onBack={() => setChooseFor(null)} />
              : (shown ? <PlateLine plate={shown} onLog={onLog} onOpen={onOpen} /> : null)}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
