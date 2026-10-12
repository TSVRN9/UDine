import { useCallback, useEffect, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, LinearTransition, FadeOut } from "react-native-reanimated";
import { useGlobalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, type BottomSheetHandleProps } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion, m2SettleEasing } from "../../lib/motion";
import { Press, Stepper, Text, thud, thunk, tick, useSheetSpring } from "../ui";
import type { DishCtx } from "../logic/dishSheet";
import { fc } from "../logic/dishSheet";
import { fq, macroOf, plateHalls, plateLabel, totals, type Plate, type PlateItem } from "../logic/plate";
import type { Dish, PlaceKey } from "../logic/types";
import { openDish } from "../state/dishSheet";
import { serveOnHalls } from "../state/serve";
import { add, clearPlate, setFront, step, useStore } from "../state/store";
import { Facts } from "./Facts";
import { BAR, PlateBar } from "./PlateBar";

const SNAPS = { bar: 0, mid: 1, large: 2 } as const;
// M2's `exit`: a row that leaves fades while the rows below close up into its place
const rowLayout = LinearTransition.duration(m2Motion.exit.d);
const rowOut = FadeOut.duration(m2Motion.exit.d);

function PlateRow({ plate, it, onOpen }: { plate: Plate; it: PlateItem; onOpen: (it: PlateItem) => void }) {
  const place = plateHalls(plate)?.[0];
  const m = macroOf(it, place);
  return (
    <Animated.View layout={rowLayout} exiting={rowOut}>
      <Press feedback="tint" accessibilityRole="button" onPress={it.custom ? undefined : () => onOpen(it)}
        style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: m2.space[1], borderBottomWidth: 1, borderBottomColor: m2.color.hair }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text v="rowName" color={m2.color.ink}>{it.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 3 }}>
            <Text v="metaNum" color={m2.color.ink}>{fc(m.cal)}</Text><Text v="meta" color={m2.color.slate}>{" cal each"}</Text>
          </View>
        </View>
        <Stepper label={fq(it.qty)}
          onDec={() => { if (it.qty === 0.5) thunk(); step(plate.id, it.key, -1); }}
          onInc={() => { thud(); step(plate.id, it.key, 1); }} />
      </Press>
    </Animated.View>
  );
}

/**
 * M2's plate sheet: the bar grown taller (the bar is its handle), rising from the bar's own slot to mid and large, above the tab bar and
 * under its dim. Rows with the stepper, the plate's totals as a Nutrition Facts panel, Clear plate. A row opens its dish over the sheet.
 * Not on screen with no plate and no receipt: the bar goes away, as M2's does.
 */
export function PlateSheet({ tabH }: { tabH: number }) {
  const { height: winH } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const router = useRouter();
  const ref = useRef<BottomSheet>(null);
  const spring = useSheetSpring();
  const plate = useStore((s) => s.plates.plates[s.plates.front]);
  const plates = useStore((s) => s.plates.plates);
  const front = useStore((s) => s.plates.front);
  const receipt = useStore((s) => s.last != null);
  const visible = plates.length > 0 || receipt;

  // M2 `sheet`: top at max(ST + 8, .36 H) for mid (its content-sized floor is not needed: the rows scroll), ST + 8 for large
  const full = winH - tabH - (top + 8);
  const mid = Math.min(full, winH - tabH - Math.max(top + 8, 0.36 * winH));
  const snaps = [BAR, mid, full];

  // the bar rises when there is something to show and goes away when there is not; an empty plate takes the open sheet down with it
  // The sheet mounts the first time there is something to show, already at the bar (gorhom drops a snap asked of it before it has
  // laid out, which left the bar missing on a cold start); after that it is shown and put away by snapping.
  const [mounted, setMounted] = useState(false);
  if (visible && !mounted) setMounted(true);
  useEffect(() => { if (!mounted) return; if (visible) ref.current?.snapToIndex(SNAPS.bar); else ref.current?.close(); }, [visible, mounted]);
  // dev only (screenshots): `?psheet=mid|large` opens the plate sheet once it has something to show
  // eslint-disable-next-line react-hooks/rules-of-hooks -- __DEV__ is a build-time constant
  const dev = __DEV__ ? useGlobalSearchParams<{ psheet?: string }>().psheet : undefined;
  useEffect(() => {
    if (!dev || !visible) return;
    const id = setTimeout(() => ref.current?.snapToIndex(dev === "large" ? SNAPS.large : SNAPS.mid), 2500);
    return () => clearTimeout(id);
  }, [dev, visible]);
  const collapse = useCallback(() => ref.current?.snapToIndex(SNAPS.bar), []);
  const Handle = useCallback((p: BottomSheetHandleProps) => <PlateBar sheet={ref} animatedIndex={p.animatedIndex} collapse={collapse} />, [collapse]);

  const open = useCallback((it: PlateItem) => {
    const pl = plate;
    const at = pl && plateHalls(pl)?.[0];
    if (!pl || !at) return;
    const ctx: DishCtx = {
      from: "plate", place: at as PlaceKey, meal: pl.meal, day: 0,
      onAdd: () => add(pl.meal, it.name, it.refs),
      // where-served from here: the plate goes down to the bar, Halls comes up with the hall pushed over it
      onServe: (t) => { collapse(); router.navigate("/bakeoff"); serveOnHalls.push(t); },
      onServeGo: () => serveOnHalls.go(),
    };
    openDish(macroOf(it, at) as Dish, ctx);
  }, [plate, collapse, router]);

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: tabH, overflow: "hidden" }}>
      {mounted ? <BottomSheet
        ref={ref} index={0} snapPoints={snaps} animationConfigs={spring} handleComponent={Handle} enablePanDownToClose={false} enableDynamicSizing={false}
        onAnimate={(from, to) => { if (from >= 0 && to >= 0 && from !== to) tick(); }}
        backgroundStyle={{ backgroundColor: m2.color.chalk, borderRadius: 0 }}
        backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={SNAPS.mid} disappearsOnIndex={SNAPS.bar} opacity={m2Motion.scrim} pressBehavior="collapse" />}>
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: m2.space[4], paddingTop: m2.space[0], paddingBottom: m2.space[5] }}>
          {plate ? (
            <Animated.View key={plate.id} entering={FadeIn.duration(m2Motion.settle.d).easing(m2SettleEasing)}>
              {plates.length > 1 ? (
                <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: m2.space[0], marginHorizontal: -m2.space[1], marginBottom: m2.space[0] }}>
                  {plates.map((p, i) => (
                    <Press key={p.id} accessibilityRole="tab" accessibilityState={{ selected: i === front }} onPress={() => { if (i !== front) { tick(); setFront(i); } }}
                      style={{ height: m2.size.tap, paddingHorizontal: 10, justifyContent: "center" }}>
                      <Text v="link" color={i === front ? m2.color.dm : m2.color.slate}>{plateLabel(p)}</Text>
                      {i === front ? <View style={{ position: "absolute", left: 10, right: 10, bottom: 4, height: 3, backgroundColor: m2.color.vm }} /> : null}
                    </Press>
                  ))}
                </View>
              ) : null}
              {plate.items.map((it) => <PlateRow key={it.key} plate={plate} it={it} onOpen={open} />)}
              <View style={{ marginVertical: m2.space[3] }}><Facts {...totals(plate)} /></View>
              <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                <Press accessibilityRole="button" onPress={clearPlate} style={{ height: m2.size.tap, paddingHorizontal: m2.space[2], justifyContent: "center" }}>
                  <Text v="link" color={m2.color.vm}>Clear plate</Text>
                </Press>
              </View>
            </Animated.View>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet> : null}
    </View>
  );
}
