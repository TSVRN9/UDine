import type { ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { m2 } from "../../lib/theme";
import { DayCell } from "./DayCell";
import type { Labels } from "./labels";
import { Layers } from "./Layers";
import { MealTabs } from "./MealTabs";
import { StationButton } from "./StationButton";
import { Text } from "./Text";
import { TitleParts } from "./TitleParts";
import { useArrive } from "./arrive";

export { Layers } from "./Layers";
export type { Labels } from "./labels";

type AStyle = React.ComponentProps<typeof Animated.View>["style"];

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
const clamp = (x: number) => {
  "worklet";
  return Math.min(1, Math.max(0, x));
};

/** The compact bar's height under the status bar (M2 CH = ST + 52). */
export const BAR = m2.size.bar;

/**
 * Round 9c hall header: photo window with the name and status, then the meal row (14 px, every meal visible, never
 * scrolled), then the station row with the day cell at its right end. Rows with no data are not drawn.
 *
 * `collapse` is M2's c (0 expanded, 1 the compact bar), from the list's scroll: the photo drifts at .45 of the scroll, a
 * solid maroon grows over it, the letter, status and busy fade, and the name shrinks into the bar (the caller translates
 * the whole header by the scroll; the rows below ride with it and pin under the bar).
 */
export function Header({ title, photo, letter, height, top = 0, labels, oldLabels, newStyle, oldStyle, gradStyle, contentStyle, collapse }: {
  title: string; photo?: ReactNode; letter?: ReactNode; height: number; top?: number;
  /** What says the day, as it is now, and as it was before a day change (it fades out in its own layer while `labels` fades in): `oldLabels` is only there while a
   * day change holds it, and the header is drawn once the rest of the time. */
  labels: Labels; oldLabels?: Labels | null;
  /** Animated styles for the container transform: the photo gradients, and the title and controls. */
  gradStyle?: AStyle; contentStyle?: AStyle;
  /** Opacity of the layer holding `labels`, and of the one holding `oldLabels`. */
  newStyle?: AStyle; oldStyle?: AStyle;
  collapse?: SharedValue<number>;
}) {
  const zero = useSharedValue(0);
  const c = collapse ?? zero;
  const R = height - top - BAR;
  const nb = useSharedValue(0);
  const onBlock = (e: LayoutChangeEvent) => {
    const { y } = e.nativeEvent.layout;
    // M2 NB: where the name's bottom lands once collapsed is ST + 38 under the top of the screen
    nb.set(top + m2.collapse.nameDrop - (y + m2.type.menuName.line - R));
  };
  const solid = useAnimatedStyle(() => ({ opacity: clamp((c.get() - m2.collapse.solidStart) / m2.collapse.solidSpan) }));
  const letterFade = useAnimatedStyle(() => ({ opacity: 1 - clamp(c.get() / m2.collapse.letterEnd) }));
  const parallax = useAnimatedStyle(() => ({ transform: [{ translateY: c.get() * R * m2.collapse.parallax }] }));
  const name = useAnimatedStyle(() => {
    const k = c.get();
    return { transform: [{ translateX: m2.collapse.nameDx * k }, { translateY: nb.get() * k }, { scale: 1 - (1 - m2.collapse.nameSize / m2.type.menuName.size) * k }] };
  });
  const fadeC = useAnimatedStyle(() => ({ opacity: 1 - clamp(c.get() / m2.collapse.fadeEnd) }));

  return (
    <View pointerEvents="box-none" style={{ backgroundColor: m2.color.dm }}>
      <View pointerEvents="box-none" style={{ height, backgroundColor: m2.color.vm, overflow: "hidden" }}>
        <Animated.View pointerEvents="none" style={[fill, parallax]}>{photo}</Animated.View>
        <Animated.View style={[fill, gradStyle]} pointerEvents="none">
          <LinearGradient colors={[...m2.gradient.headTop.stops]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: top + m2.gradient.headTop.height.plus }} pointerEvents="none" />
          <LinearGradient colors={[...m2.gradient.headBottom.stops]} locations={[...m2.gradient.headBottom.locations]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: m2.gradient.headBottom.height }} pointerEvents="none" />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[fill, { backgroundColor: m2.color.vm }, solid]} />
        <Animated.View pointerEvents="none" style={[fill, letterFade]}>{letter}</Animated.View>
        <Animated.View style={[fill, contentStyle]} pointerEvents="box-none">
          <View onLayout={onBlock} pointerEvents="box-none" style={{ position: "absolute", left: m2.space.gutter, bottom: m2.size.nameBottom }}>
            <Animated.View style={[{ transformOrigin: "0% 100%" }, name]}><Text v="menuName" color={m2.color.white} accessibilityRole="header">{title}</Text></Animated.View>
            <Animated.View pointerEvents="box-none" style={fadeC}>
              <Layers now={<TitleParts l={labels} />} was={oldLabels ? <TitleParts l={oldLabels} /> : null} newStyle={newStyle} oldStyle={oldStyle} />
            </Animated.View>
          </View>
          <Animated.View pointerEvents="none" style={[fill, fadeC]}><Animated.View pointerEvents="none" style={[fill, newStyle]}>{labels.board}</Animated.View></Animated.View>
        </Animated.View>
      </View>
      {labels.meals ? (
        <View accessibilityRole="tablist" style={{ height: m2.size.tabs, paddingHorizontal: m2.space.line }}>
          <Animated.View style={[{ flex: 1 }, contentStyle]}>
            <Layers fillParent now={<Arrive key={labels.meals.items.length ? "tabs" : "none"} on={labels.arrive?.menu}><MealTabs meals={labels.meals} /></Arrive>} was={oldLabels?.meals ? <MealTabs meals={oldLabels?.meals} /> : null} newStyle={newStyle} oldStyle={oldStyle} />
          </Animated.View>
        </View>
      ) : null}
      {labels.station || labels.day ? (
        <View style={{ height: m2.size.tabs, flexDirection: "row", borderTopWidth: labels.meals ? 1 : 0, borderTopColor: m2.color.swRule }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Animated.View style={[{ flex: 1 }, contentStyle]}>
              <Layers fillParent now={labels.station ? <Arrive on={labels.arrive?.menu}><StationButton s={labels.station} /></Arrive> : null} was={oldLabels?.station ? <StationButton s={oldLabels?.station} /> : null} newStyle={newStyle} oldStyle={oldStyle} />
            </Animated.View>
          </View>
          {labels.day ? (
            <Animated.View style={contentStyle}>
              {/* a zero-height copy of both cells gives the cell the wider of the two widths, so "Today" does not shift when "Fri 9" arrives */}
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 0, overflow: "hidden", opacity: 0 }}>
                <DayCell d={labels.day} />{oldLabels?.day ? <DayCell d={oldLabels?.day} /> : null}
              </View>
              <Layers fillParent now={<DayCell d={labels.day} />} was={oldLabels?.day ? <DayCell d={oldLabels?.day} /> : null} newStyle={newStyle} oldStyle={oldStyle} />
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A layout animation on its own wrapper, so it starts on the UI thread at mount and never fights the layer's opacity above it. */
function Arrive({ on, children }: { on?: boolean; children: ReactNode }) {
  const { arriveIn } = useArrive();
  return <Animated.View entering={on ? arriveIn : undefined} style={{ flex: 1 }}>{children}</Animated.View>;
}
