import { useEffect, useRef, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { LinearGradient } from "expo-linear-gradient";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import { Press } from "./Press";
import { Text } from "./Text";

type AStyle = React.ComponentProps<typeof Animated.View>["style"];

const Chevron = ({ stroke = m2.color.gold, size = 18, width = 2.4 }: { stroke?: string; size?: number; width?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 7l5 5 5-5" /></Svg>
);

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
const clamp = (x: number) => {
  "worklet";
  return Math.min(1, Math.max(0, x));
};
const settle = Easing.bezier(...m2Motion.settle.e);

/** The compact bar's height under the status bar (M2 CH = ST + 52). */
export const BAR = 52;

/**
 * Round 9c hall header: photo window with the name and status, then the meal row (14 px, every meal visible, never
 * scrolled), then the station row with the day cell at its right end. Rows with no data are not drawn.
 *
 * `collapse` is M2's c (0 expanded, 1 the compact bar), from the list's scroll: the photo drifts at .45 of the scroll, a
 * solid maroon grows over it, the letter, status and busy fade, and the name shrinks into the bar (the caller translates
 * the whole header by the scroll; the rows below ride with it and pin under the bar).
 */
export function Header({ title, status, onStatus, busy, board, photo, letter, height = 240, top = 0, meals, station, day, gradStyle, contentStyle, partsStyle, collapse }: {
  title: string; status?: string; onStatus?: () => void; busy?: ReactNode; board?: ReactNode; photo?: ReactNode; letter?: ReactNode; height?: number; top?: number;
  meals?: { items: { key: string; label: string }[]; selected: string; onSelect: (key: string) => void };
  station?: { label: string; onPress: () => void; open?: boolean };
  day?: { label: string; accessibilityLabel: string; onPress: () => void };
  /** Animated styles for the container transform: the photo gradients, and the title and controls. */
  gradStyle?: AStyle; contentStyle?: AStyle;
  /** Fades the parts that name the day (labels, status, busy, board) while it changes. */
  partsStyle?: AStyle;
  collapse?: SharedValue<number>;
}) {
  const zero = useSharedValue(0);
  const c = collapse ?? zero;
  const R = height - top - BAR;
  const nb = useSharedValue(0);
  const onBlock = (e: LayoutChangeEvent) => {
    const { y } = e.nativeEvent.layout;
    // M2 NB: where the name's bottom lands once collapsed is ST + 38 under the top of the screen
    nb.set(top + 38 - (y + m2.type.menuName.line - R));
  };
  const solid = useAnimatedStyle(() => ({ opacity: clamp((c.get() - 0.3) / 0.55) }));
  const letterFade = useAnimatedStyle(() => ({ opacity: 1 - clamp(c.get() / 0.55) }));
  const parallax = useAnimatedStyle(() => ({ transform: [{ translateY: c.get() * R * 0.45 }] }));
  const name = useAnimatedStyle(() => {
    const k = c.get();
    return { transform: [{ translateX: 44 * k }, { translateY: nb.get() * k }, { scale: 1 - (1 - 22 / m2.type.menuName.size) * k }] };
  });
  const fadeC = useAnimatedStyle(() => ({ opacity: 1 - clamp(c.get() / 0.3) }));

  // the gold underline slides to the selected tab (M2 placeUL: translateX(offsetLeft + 8) scaleX(width - 16), settle)
  const tabs = useRef<Record<string, { x: number; w: number }>>({});
  const ulX = useSharedValue(0), ulW = useSharedValue(0), ulSet = useRef(false);
  const place = (key: string, animate: boolean) => {
    const t = tabs.current[key];
    if (!t) return;
    if (!animate || !ulSet.current) { ulX.set(t.x + 8); ulW.set(t.w - 16); ulSet.current = true; return; }
    ulX.set(withTiming(t.x + 8, { duration: m2Motion.settle.d, easing: settle }));
    ulW.set(withTiming(t.w - 16, { duration: m2Motion.settle.d, easing: settle }));
  };
  const selected = meals?.selected;
  useEffect(() => { if (selected) place(selected, true); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const underline = useAnimatedStyle(() => ({ transform: [{ translateX: ulX.get() }, { scaleX: Math.max(ulW.get(), 0) }] }));

  return (
    <View pointerEvents="box-none" style={{ backgroundColor: m2.color.dm }}>
      <View pointerEvents="box-none" style={{ height, backgroundColor: m2.color.vm, overflow: "hidden" }}>
        <Animated.View pointerEvents="none" style={[fill, parallax]}>{photo}</Animated.View>
        <Animated.View style={[fill, gradStyle]} pointerEvents="none">
          <LinearGradient colors={["rgba(59,10,15,0.6)", "rgba(59,10,15,0)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: top + 80 }} pointerEvents="none" />
          <LinearGradient colors={["rgba(59,10,15,0)", "rgba(59,10,15,0.5)", "rgba(59,10,15,0.93)"]} locations={[0, 0.3, 0.76]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 240 }} pointerEvents="none" />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[fill, { backgroundColor: m2.color.vm }, solid]} />
        <Animated.View pointerEvents="none" style={[fill, letterFade]}>{letter}</Animated.View>
        <Animated.View style={[fill, contentStyle]} pointerEvents="box-none">
          <View onLayout={onBlock} pointerEvents="box-none" style={{ position: "absolute", left: m2.space[4], bottom: 50 }}>
            <Animated.View style={[{ transformOrigin: "0% 100%" }, name]}><Text v="menuName" color={m2.color.white} accessibilityRole="header">{title}</Text></Animated.View>
            <Animated.View pointerEvents="box-none" style={fadeC}><Animated.View pointerEvents="box-none" style={partsStyle}>
              <View style={{ minHeight: 20, marginTop: 7 }}>
                {status ? (
                  <Press accessibilityRole="button" accessibilityLabel={`${status}, hours and directions`} onPress={onStatus} disabled={!onStatus}
                    hitSlop={{ top: 5, bottom: 12, right: 16 }} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text v="status" color={m2.color.onDmSoft}>{status}</Text>
                    {onStatus ? <Chevron size={14} stroke="rgba(255,255,255,0.6)" width={2} /> : null}
                  </Press>
                ) : null}
              </View>
              {busy}
            </Animated.View></Animated.View>
          </View>
          <Animated.View pointerEvents="none" style={[fill, fadeC]}><Animated.View pointerEvents="none" style={[fill, partsStyle]}>{board}</Animated.View></Animated.View>
        </Animated.View>
      </View>
      {meals ? (
        <View accessibilityRole="tablist" style={{ height: m2.size.tabs, paddingHorizontal: 4 }}>
          <Animated.View style={[{ flex: 1 }, contentStyle]}><Animated.View style={[{ flex: 1, flexDirection: "row" }, partsStyle]}>
            {meals.items.map((m) => {
              const on = m.key === meals.selected;
              return (
                <Press key={m.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => meals.onSelect(m.key)}
                  onLayout={(e) => { tabs.current[m.key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width }; if (on) place(m.key, false); }}
                  style={{ flexGrow: 1, flexShrink: 1, height: m2.size.tabs, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                  <Text v="mealTab" color={on ? m2.color.white : m2.color.onDm} style={{ fontFamily: on ? m2.font.bodySb : m2.font.bodyMd }} numberOfLines={1}>{m.label}</Text>
                </Press>
              );
            })}
            {meals.items.length ? <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, bottom: 0, height: 3, width: 1, backgroundColor: m2.color.gold, transformOrigin: "0% 0%" }, underline]} /> : null}
          </Animated.View></Animated.View>
        </View>
      ) : null}
      {station || day ? (
        <View style={{ height: m2.size.tabs, flexDirection: "row", borderTopWidth: meals ? 1 : 0, borderTopColor: "rgba(255,255,255,0.12)" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {station ? (
              <Animated.View style={[{ flex: 1 }, contentStyle]}><Animated.View style={[{ flex: 1 }, partsStyle]}>
                <Press feedback="tint" accessibilityRole="button" accessibilityLabel={`${station.label}, stations`} accessibilityState={{ expanded: !!station.open }} onPress={station.onPress}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: m2.space[4] }}>
                  <Text v="station" color={m2.color.gold} numberOfLines={1} style={{ flexShrink: 1 }}>{station.label}</Text>
                  <Flip open={!!station.open}><Chevron /></Flip>
                </Press>
              </Animated.View></Animated.View>
            ) : null}
          </View>
          {day ? (
            <Animated.View style={contentStyle}><Animated.View style={[{ flex: 1 }, partsStyle]}>
              <Press feedback="tint" accessibilityRole="button" accessibilityLabel={day.accessibilityLabel} onPress={day.onPress}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: m2.space[3], paddingRight: m2.space[4], borderLeftWidth: 1, borderLeftColor: m2.color.divider }}>
                <Text v="day" color={m2.color.gold}>{day.label}</Text>
                <Chevron />
              </Press>
            </Animated.View></Animated.View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** M2 `.swbtn[aria-expanded=true] svg`: the chevron turns over on the container's own timing. */
function Flip({ open, children }: { open: boolean; children: ReactNode }) {
  const r = useSharedValue(0);
  useEffect(() => { r.set(withTiming(open ? 1 : 0, { duration: m2Motion.cont.d })); }, [open, r]);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get() * 180}deg` }] }));
  return <Animated.View style={s}>{children}</Animated.View>;
}
