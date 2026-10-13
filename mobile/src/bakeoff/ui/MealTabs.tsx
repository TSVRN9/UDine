import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import type { Labels } from "./labels";
import { timed } from "./motion";
import { Press } from "./Press";
import { Text } from "./Text";

/** The meal row's tabs, with the gold underline sliding to the selected one (M2 placeUL: translateX(offsetLeft + 8) scaleX(width - 16), settle). */
export function MealTabs({ meals }: { meals: NonNullable<Labels["meals"]> }) {
  const tabs = useRef<Record<string, { x: number; w: number }>>({});
  const ulX = useSharedValue(0), ulW = useSharedValue(0), ulSet = useRef(false);
  const place = (key: string, animate: boolean) => {
    const t = tabs.current[key];
    if (!t) return;
    if (!animate || !ulSet.current) { ulX.set(t.x + 8); ulW.set(t.w - 16); ulSet.current = true; return; }
    ulX.set(timed(t.x + 8, m2Motion.settle));
    ulW.set(timed(t.w - 16, m2Motion.settle));
  };
  const selected = meals.selected;
  useEffect(() => { place(selected, true); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const underline = useAnimatedStyle(() => ({ transform: [{ translateX: ulX.get() }, { scaleX: Math.max(ulW.get(), 0) }] }));
  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      {meals.items.map((m) => {
        const on = m.key === meals.selected;
        return (
          <Press key={m.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => meals.onSelect(m.key)}
            onLayout={(e) => { tabs.current[m.key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width }; if (on) place(m.key, false); }}
            style={{ flexGrow: 1, flexShrink: 1, height: m2.size.tabs, paddingHorizontal: m2.space.mealTabPad, alignItems: "center", justifyContent: "center" }}>
            <Text v="mealTab" color={on ? m2.color.white : m2.color.onDm} style={{ fontFamily: on ? m2.font.bodySb : m2.font.bodyMd }} numberOfLines={1}>{m.label}</Text>
          </Press>
        );
      })}
      {meals.items.length ? <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, bottom: 0, height: m2.size.indicator, width: 1, backgroundColor: m2.color.gold, transformOrigin: "0% 0%" }, underline]} /> : null}
    </View>
  );
}
