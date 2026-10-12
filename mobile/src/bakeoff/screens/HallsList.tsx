import { useRef, type RefObject } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { Band, BusyRow, Button, HallLetter, Photo, Text } from "../ui";
import { RowChevron } from "../ui/Chevron";
import { LRow, LRowSub } from "../ui/LRow";
import { ScreenHeader } from "../ui/ScreenHeader";
import { useArrival, useArrive } from "../ui/arrive";
import { busyView } from "../logic/busy";
import { HALLS, MEAL_LABEL, clockMeal, loadFixture } from "../logic/fixture";
import { HALL_LX } from "../logic/letters";
import { isOpenNow, statusText } from "../logic/status";
import type { PlaceKey } from "../logic/types";
import { hoursKnown, liveKnown, retry, useNet } from "../state/net";
import { useStore } from "../state/store";
import { CAFE_OFF, PHOTO_OFF, PHOTO_POS, photoOf } from "../photos";

/** The pinned cafés on Halls; pinning UI is out of scope for the bake-off. */
const PINS = ["Wasabi", "Tamales"];

export const headerHeight = (top: number) => top + 282;
export const bandOff = (key: PlaceKey, top: number) => Math.round((key.startsWith("c") ? CAFE_OFF : PHOTO_OFF[key as "W"]) * headerHeight(top));

export function HallsList({ hidden, onOpen }: {
  hidden: PlaceKey | null;
  onOpen: (key: PlaceKey, band: RefObject<View | null>, compact: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const { arriveIn } = useArrive();
  const fx = loadFixture();
  const newton = useStore((s) => s.newton);
  // what the network has told Halls: hours (the status lines) and live busy arrive in place, or never (M2 `fillBands`)
  const net = useNet(), hk = hoursKnown(net), lk = liveKnown(net), hkArrive = useArrival(hk), lkArrive = useArrival(lk);
  const now = new Date(fx.clock);
  const HH = headerHeight(top);
  const refs = useRef<Record<string, RefObject<View | null>>>({});
  const refOf = (k: string) => (refs.current[k] ??= { current: null });

  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const places = [...HALLS, ...PINS.map((n) => fx.places.find((p) => p.name === n)!.key)] as PlaceKey[];
  const cell = (key: PlaceKey) => {
    const p = fx.places.find((q) => q.key === key)!;
    const compact = key.startsWith("c");
    const src = photoOf(key, p.name);
    const off = bandOff(key, top);
    return (
      <View key={key} ref={refOf(key)} collapsable={false} style={{ opacity: hidden === key ? 0 : 1 }}>
        <Band
          name={p.name} compact={compact} status={hk ? statusText(fx.hours[key], now) : undefined} arrive={hkArrive}
          busy={compact || !lk ? undefined : <Animated.View entering={lkArrive ? arriveIn : undefined}><BusyRow {...busyView(fx.busy[key as "W"])} /></Animated.View>} onPress={() => onOpen(key, refOf(key), compact)}
          photo={src ? (
            <View style={{ position: "absolute", left: 0, top: -off }}>
              <Photo source={src} width={width} height={HH} pos={compact ? 0.5 : PHOTO_POS[key as "W"]} />
            </View>
          ) : undefined}
          letter={compact ? undefined : <HallLetter letter={key} x={HALL_LX[key as "W"]} />}
        />
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: m2.color.chalk }}>
      <Animated.ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader brand="UDine" date={date} title={MEAL_LABEL[clockMeal(now)]}>
          {net.mode === "offline" || net.mode === "fail" ? (
            <View accessibilityLiveRegion="polite" style={{ position: "absolute", right: m2.space.gutter, top: top + m2.space.netTop, alignItems: "flex-end" }}>
              <Text v="date" color={m2.color.onDm}>{net.mode === "offline" ? "You're offline" : "Couldn't connect"}</Text>
              {net.mode === "fail" ? (
                <Button kind="outline" size="md" label="Try again" onPress={() => { retry(); }} style={{ marginTop: m2.space.netBtnTop }} />
              ) : null}
            </View>
          ) : null}
        </ScreenHeader>
        <View style={{ backgroundColor: m2.color.dm }}>{places.slice(0, 4).map(cell)}</View>
        <View style={{ backgroundColor: m2.color.dm }}>{places.slice(4).map(cell)}</View>
        <View style={{ paddingTop: m2.space.sectionTop, paddingHorizontal: m2.space.gutter, paddingBottom: m2.size.listFoot }}>
          <Text v="section" color={m2.color.dm} style={{ marginBottom: m2.space.line }}>Cafés & markets</Text>
          {fx.areas.slice(0, newton ? 5 : 4).map((a, i, all) => {
            const ps = fx.places.filter((p) => p.area === i);
            const open = ps.filter((p) => isOpenNow(fx.hours[p.key], now)).length;
            return (
              <LRow key={a} title={a} last={i === all.length - 1} trailing={<RowChevron />}
                sub={hk ? <Animated.View entering={hkArrive ? arriveIn : undefined}><LRowSub>{`${open} of ${ps.length} open now`}</LRowSub></Animated.View> : undefined} />
            );
          })}
        </View>
      </Animated.ScrollView>
    </View>
  );
}
