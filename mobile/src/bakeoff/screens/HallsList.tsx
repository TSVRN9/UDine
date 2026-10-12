import { useRef, type RefObject } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { Band, HallLetter, Photo, Text } from "../ui";
import { HALLS, MEAL_LABEL, clockMeal, loadFixture } from "../logic/fixture";
import { HALL_LX } from "../logic/letters";
import { isOpenNow, statusText } from "../logic/status";
import type { PlaceKey } from "../logic/types";
import { CAFE_OFF, PHOTO_OFF, PHOTO_POS, photoOf } from "../photos";

/** The pinned cafés on Halls; pinning UI is out of scope for the bake-off. */
const PINS = ["Wasabi", "Tamales"];

export const headerHeight = (top: number) => top + 282;
export const bandOff = (key: PlaceKey, top: number) => Math.round((key.startsWith("c") ? CAFE_OFF : PHOTO_OFF[key as "W"]) * headerHeight(top));

const Chevron = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={m2.color.slate} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 6l6 6-6 6" /></Svg>
);

export function HallsList({ hidden, onOpen }: {
  hidden: PlaceKey | null;
  onOpen: (key: PlaceKey, band: RefObject<View | null>, compact: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const fx = loadFixture();
  const now = new Date(fx.clock);
  const HH = headerHeight(top);
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y; });
  const bar = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (y.value - 40) / 24)) }));
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
          name={p.name} compact={compact} status={statusText(fx.hours[key], now)} onPress={() => onOpen(key, refOf(key), compact)}
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
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: m2.color.dm, paddingTop: top + 10, paddingHorizontal: m2.space[4], paddingBottom: m2.space[3] }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", height: 30 }}>
            <Text v="brand" color={m2.color.gold}>UDine</Text>
            <Text v="date" color={m2.color.onDm}>{date}</Text>
          </View>
          <Text v="hallTitle" color={m2.color.white} accessibilityRole="header" style={{ marginTop: 2 }}>{MEAL_LABEL[clockMeal(now)]}</Text>
        </View>
        <View style={{ backgroundColor: m2.color.dm }}>{places.slice(0, 4).map(cell)}</View>
        <View style={{ backgroundColor: m2.color.dm }}>{places.slice(4).map(cell)}</View>
        <View style={{ paddingTop: m2.space[4] + 6, paddingHorizontal: m2.space[4], paddingBottom: 120 }}>
          <Text v="section" color={m2.color.dm} style={{ marginBottom: m2.space[0] }}>Cafés & markets</Text>
          {fx.areas.slice(0, 4).map((a, i) => {
            const ps = fx.places.filter((p) => p.area === i);
            const open = ps.filter((p) => isOpenNow(fx.hours[p.key], now)).length;
            return (
              <View key={a} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: m2.space[1], borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: m2.color.hair }}>
                <View>
                  <Text v="rowName">{a}</Text>
                  <Text v="meta" color={m2.color.slate} style={{ marginTop: 2 }}>{`${open} of ${ps.length} open now`}</Text>
                </View>
                <Chevron />
              </View>
            );
          })}
        </View>
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, height: top + 44, backgroundColor: m2.color.dm, paddingTop: top, paddingHorizontal: m2.space[4], flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, bar]}>
        <Text v="brand" color={m2.color.gold}>UDine</Text>
        <Text v="date" color={m2.color.onDm}>{date}</Text>
      </Animated.View>
    </View>
  );
}
