import { useEffect, useRef, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { LinearGradient } from "expo-linear-gradient";
import { m2 } from "../../lib/theme";
import { m2Motion, m2SettleEasing } from "../../lib/motion";
import { Press } from "./Press";
import { Text } from "./Text";
import { arriveIn } from "./arrive";

type AStyle = React.ComponentProps<typeof Animated.View>["style"];

const Chevron = ({ stroke = m2.color.gold, size = 18, width = 2.4 }: { stroke?: string; size?: number; width?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 7l5 5 5-5" /></Svg>
);

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
const clamp = (x: number) => {
  "worklet";
  return Math.min(1, Math.max(0, x));
};

/** The compact bar's height under the status bar (M2 CH = ST + 52). */
export const BAR = 52;

export interface Labels {
  status?: string; onStatus?: () => void; busy?: ReactNode; board?: ReactNode;
  meals?: { items: { key: string; label: string }[]; selected: string; onSelect: (key: string) => void };
  station?: { label: string; onPress: () => void; open?: boolean };
  day?: { label: string; accessibilityLabel: string; onPress: () => void };
  /** The tab and station labels arrived from the network just now: they fade in where they end up (the status and busy lines come in at once, as in M2). */
  arrive?: { menu?: boolean };
}

const abs = { position: "absolute", top: 0, left: 0, right: 0 } as const;
/** The day's labels exist twice, `now` and `was`, stacked: a day change commits the new ones while the old stay on screen, and the
 * switch is two opacities on the UI thread, with no commit between them. `was` never takes touches. */
export function Layers({ now, was, newStyle, oldStyle, fillParent }: { now: ReactNode; was: ReactNode; newStyle?: AStyle; oldStyle?: AStyle; fillParent?: boolean }) {
  return (
    <View style={fillParent ? { flex: 1 } : undefined}>
      <Animated.View style={[fillParent ? { flex: 1 } : null, newStyle]}>{now}</Animated.View>
      <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[fillParent ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } : abs, oldStyle]}>{was}</Animated.View>
    </View>
  );
}

/**
 * Round 9c hall header: photo window with the name and status, then the meal row (14 px, every meal visible, never
 * scrolled), then the station row with the day cell at its right end. Rows with no data are not drawn.
 *
 * `collapse` is M2's c (0 expanded, 1 the compact bar), from the list's scroll: the photo drifts at .45 of the scroll, a
 * solid maroon grows over it, the letter, status and busy fade, and the name shrinks into the bar (the caller translates
 * the whole header by the scroll; the rows below ride with it and pin under the bar).
 */
export function Header({ title, photo, letter, height = 240, top = 0, labels, oldLabels, newStyle, oldStyle, gradStyle, contentStyle, collapse }: {
  title: string; photo?: ReactNode; letter?: ReactNode; height?: number; top?: number;
  /** What says the day, as it is now, and as it was before a day change (it fades out in its own layer while `labels` fades in). */
  labels: Labels; oldLabels: Labels;
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
            <Animated.View pointerEvents="box-none" style={fadeC}>
              <Layers now={<TitleParts l={labels} />} was={<TitleParts l={oldLabels} />} newStyle={newStyle} oldStyle={oldStyle} />
            </Animated.View>
          </View>
          <Animated.View pointerEvents="none" style={[fill, fadeC]}><Animated.View pointerEvents="none" style={[fill, newStyle]}>{labels.board}</Animated.View><Animated.View pointerEvents="none" style={[fill, oldStyle]}>{oldLabels.board}</Animated.View></Animated.View>
        </Animated.View>
      </View>
      {labels.meals ? (
        <View accessibilityRole="tablist" style={{ height: m2.size.tabs, paddingHorizontal: 4 }}>
          <Animated.View style={[{ flex: 1 }, contentStyle]}>
            <Layers fillParent now={<Arrive key={labels.meals.items.length ? "tabs" : "none"} on={labels.arrive?.menu}><TabRow meals={labels.meals} /></Arrive>} was={oldLabels.meals ? <TabRow meals={oldLabels.meals} /> : null} newStyle={newStyle} oldStyle={oldStyle} />
          </Animated.View>
        </View>
      ) : null}
      {labels.station || labels.day ? (
        <View style={{ height: m2.size.tabs, flexDirection: "row", borderTopWidth: labels.meals ? 1 : 0, borderTopColor: "rgba(255,255,255,0.12)" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Animated.View style={[{ flex: 1 }, contentStyle]}>
              <Layers fillParent now={labels.station ? <Arrive on={labels.arrive?.menu}><StationButton s={labels.station} /></Arrive> : null} was={oldLabels.station ? <StationButton s={oldLabels.station} /> : null} newStyle={newStyle} oldStyle={oldStyle} />
            </Animated.View>
          </View>
          {labels.day ? (
            <Animated.View style={contentStyle}>
              {/* a zero-height copy of both cells gives the cell the wider of the two widths, so "Today" does not shift when "Fri 9" arrives */}
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 0, overflow: "hidden", opacity: 0 }}>
                <DayCell d={labels.day} />{oldLabels.day ? <DayCell d={oldLabels.day} /> : null}
              </View>
              <Layers fillParent now={<DayCell d={labels.day} />} was={oldLabels.day ? <DayCell d={oldLabels.day} /> : null} newStyle={newStyle} oldStyle={oldStyle} />
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A layout animation on its own wrapper, so it starts on the UI thread at mount and never fights the layer's opacity above it. */
function Arrive({ on, children }: { on?: boolean; children: ReactNode }) {
  return <Animated.View entering={on ? arriveIn : undefined} style={{ flex: 1 }}>{children}</Animated.View>;
}

function TitleParts({ l }: { l: Labels }) {
  return (
    <>
      <View style={{ minHeight: 20, marginTop: 7 }}>
        {l.status ? (
          <Press accessibilityRole="button" accessibilityLabel={`${l.status}, hours and directions`} onPress={l.onStatus} disabled={!l.onStatus}
            hitSlop={{ top: 5, bottom: 12, right: 16 }} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text v="status" color={m2.color.onDmSoft}>{l.status}</Text>
            {l.onStatus ? <Chevron size={14} stroke="rgba(255,255,255,0.6)" width={2} /> : null}
          </Press>
        ) : null}
      </View>
      {l.busy}
    </>
  );
}

function StationButton({ s }: { s: NonNullable<Labels["station"]> }) {
  return (
    <Press feedback="tint" accessibilityRole="button" accessibilityLabel={`${s.label}, stations`} accessibilityState={{ expanded: !!s.open }} onPress={s.onPress}
      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: m2.space[4] }}>
      <Text v="station" color={m2.color.gold} numberOfLines={1} style={{ flexShrink: 1 }}>{s.label}</Text>
      <Flip open={!!s.open}><Chevron /></Flip>
    </Press>
  );
}

function DayCell({ d }: { d: NonNullable<Labels["day"]> }) {
  return (
    <Press feedback="tint" accessibilityRole="button" accessibilityLabel={d.accessibilityLabel} onPress={d.onPress}
      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: m2.space[3], paddingRight: m2.space[4], borderLeftWidth: 1, borderLeftColor: m2.color.divider }}>
      <Text v="day" color={m2.color.gold}>{d.label}</Text>
      <Chevron />
    </Press>
  );
}

/** The meal row's tabs, with the gold underline sliding to the selected one (M2 placeUL: translateX(offsetLeft + 8) scaleX(width - 16), settle). */
function TabRow({ meals }: { meals: NonNullable<Labels["meals"]> }) {
  const tabs = useRef<Record<string, { x: number; w: number }>>({});
  const ulX = useSharedValue(0), ulW = useSharedValue(0), ulSet = useRef(false);
  const place = (key: string, animate: boolean) => {
    const t = tabs.current[key];
    if (!t) return;
    if (!animate || !ulSet.current) { ulX.set(t.x + 8); ulW.set(t.w - 16); ulSet.current = true; return; }
    ulX.set(withTiming(t.x + 8, { duration: m2Motion.settle.d, easing: m2SettleEasing }));
    ulW.set(withTiming(t.w - 16, { duration: m2Motion.settle.d, easing: m2SettleEasing }));
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
            style={{ flexGrow: 1, flexShrink: 1, height: m2.size.tabs, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
            <Text v="mealTab" color={on ? m2.color.white : m2.color.onDm} style={{ fontFamily: on ? m2.font.bodySb : m2.font.bodyMd }} numberOfLines={1}>{m.label}</Text>
          </Press>
        );
      })}
      {meals.items.length ? <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, bottom: 0, height: 3, width: 1, backgroundColor: m2.color.gold, transformOrigin: "0% 0%" }, underline]} /> : null}
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
