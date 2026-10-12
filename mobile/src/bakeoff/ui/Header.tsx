import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { Text } from "./Text";

const Chevron = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={m2.color.gold} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M6 9l6 6 6-6" /></Svg>
);

/** Round 9c hall header: photo window with the name and status, then the meal row (14 px, every meal visible,
 * never scrolled), then the station row with the day cell at its right end. Rows with no data are not drawn. */
export function Header({ title, status, photo, letter, height = 240, top = 0, left, right, meals, station, day }: {
  title: string; status?: ReactNode; photo?: ReactNode; letter?: ReactNode; height?: number; top?: number;
  left?: ReactNode; right?: ReactNode;
  meals?: { items: { key: string; label: string }[]; selected: string; onSelect: (key: string) => void };
  station?: { label: string; onPress: () => void; open?: boolean };
  day?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ backgroundColor: m2.color.dm }}>
      <View style={{ height, backgroundColor: m2.color.vm, overflow: "hidden" }}>
        {photo}
        <LinearGradient colors={["rgba(59,10,15,0.6)", "rgba(59,10,15,0)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: top + 80 }} pointerEvents="none" />
        <LinearGradient colors={["rgba(59,10,15,0)", "rgba(59,10,15,0.5)", "rgba(59,10,15,0.93)"]} locations={[0, 0.3, 0.76]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 240 }} pointerEvents="none" />
        {letter}
        <View style={{ position: "absolute", top, left: 4, right: 4, height: 52, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>{left}{right}</View>
        <View style={{ position: "absolute", left: m2.space[4], bottom: 50 }}>
          <Text v="menuName" color={m2.color.white} accessibilityRole="header">{title}</Text>
          {status ? <Text v="status" color={m2.color.onDmSoft} style={{ marginTop: 7 }}>{status}</Text> : null}
        </View>
      </View>
      {meals ? (
        <View accessibilityRole="tablist" style={{ height: m2.size.tabs, flexDirection: "row", paddingHorizontal: 4 }}>
          {meals.items.map((m) => {
            const on = m.key === meals.selected;
            return (
              <Press key={m.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => meals.onSelect(m.key)}
                style={{ flexGrow: 1, flexShrink: 1, height: m2.size.tabs, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                <Text v="mealTab" color={on ? m2.color.white : m2.color.onDm} style={{ fontFamily: on ? m2.font.bodySb : m2.font.bodyMd }} numberOfLines={1}>{m.label}</Text>
                {on ? <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: m2.color.gold }} /> : null}
              </Press>
            );
          })}
        </View>
      ) : null}
      {station || day ? (
        <View style={{ height: m2.size.tabs, flexDirection: "row", borderTopWidth: meals ? 1 : 0, borderTopColor: "rgba(255,255,255,0.12)" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {station ? (
              <Press feedback="tint" accessibilityRole="button" accessibilityState={{ expanded: !!station.open }} onPress={station.onPress}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: m2.space[4] }}>
                <Text v="station" color={m2.color.gold} numberOfLines={1} style={{ flexShrink: 1 }}>{station.label}</Text>
                <Chevron />
              </Press>
            ) : null}
          </View>
          {day ? (
            <Press feedback="tint" accessibilityRole="button" accessibilityLabel={day.label} onPress={day.onPress}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: m2.space[3] + 4, paddingRight: m2.space[4], borderLeftWidth: 1, borderLeftColor: m2.color.divider }}>
              <Text v="day" color={m2.color.gold}>{day.label}</Text>
              <Chevron />
            </Press>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
