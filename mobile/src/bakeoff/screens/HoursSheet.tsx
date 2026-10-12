import { forwardRef, useRef } from "react";
import { Linking, Platform, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { Press, Sheet, Text } from "../ui";
import type { Schedule } from "../logic/schedule";

const mapsUrl = (ll: string, name: string) =>
  Platform.OS === "ios" ? `https://maps.apple.com/?ll=${ll}&q=${encodeURIComponent(name)}` : `https://www.google.com/maps/search/?api=1&query=${ll}`;

const Rchev = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={m2.color.slate} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 6l6 6-6 6" /></Svg>
);

/**
 * M2's schedule (round 9): where the place is, then the days in date order with the chosen one open in place. A day row
 * picks that day; opened on a later day it scrolls just enough that the chosen day and its hours are on screen at rest.
 */
export const HoursSheet = forwardRef<BottomSheetModal, { s: Schedule; maxHeight: number; onPick: (i: number) => void; onDismiss: () => void }>(
  function HoursSheet({ s, maxHeight, onPick, onDismiss }, ref) {
    const scroll = useRef<{ scrollTo: (o: { y: number; animated: boolean }) => void }>(null);
    const view = useRef(0), listY = useRef(0), tops = useRef<Record<number, number>>({});
    // the chosen day's block ends at `end`; at rest the sheet shows `view` px of the list
    const toChosen = () => {
      const cur = s.days.find((d) => d.current);
      if (!cur) return;
      const bottom = tops.current[cur.i];
      if (bottom == null || !view.current) return;
      const need = listY.current + bottom + 12 - view.current;
      if (need > 0) { const r = scroll.current as any; (r?.getScrollResponder?.() ?? r)?.scrollTo({ y: need, animated: false }); }
    };
    return (
      <Sheet ref={ref} maxHeight={maxHeight} onDismiss={onDismiss} onOpen={toChosen} scrollRef={scroll}>
        <View onLayout={(e) => { view.current = maxHeight - 22; toChosen(); void e; }}>
          <Text v="schedHead" color={m2.color.dm} style={{ marginTop: 2 }}>{s.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
            <View style={{ flex: 1 }}>
              <Text v="sched" color={m2.color.slate}>{s.address}</Text>
              {s.building ? <Text v="sched" color={m2.color.slate}>{s.building}</Text> : null}
            </View>
            {s.mapAddress ? (
              <Press accessibilityRole="link" accessibilityLabel="Directions" onPress={() => Linking.openURL(mapsUrl(s.mapAddress!, s.name))}
                style={{ height: m2.size.tap, paddingHorizontal: m2.space[3], borderRadius: m2.radius.button, borderWidth: 1.5, borderColor: m2.color.vm, justifyContent: "center" }}>
                <Text v="link" color={m2.color.vm}>Directions</Text>
              </Press>
            ) : null}
          </View>
          {s.payment ? (
            <Text v="sched" color={m2.color.slate} style={{ marginTop: 10 }}><Text v="link" color={m2.color.dm}>Payment  </Text>{s.payment}</Text>
          ) : null}
          <View accessibilityRole="list" onLayout={(e) => { listY.current = e.nativeEvent.layout.y; toChosen(); }} style={{ marginTop: m2.space[3], marginHorizontal: -m2.space[4], borderTopWidth: 1, borderTopColor: m2.color.hair }}>
            {s.days.map((d) => {
              const ink = d.current ? m2.color.vm : m2.color.ink;
              return (
                <View key={d.i} onLayout={(e) => { tops.current[d.i] = e.nativeEvent.layout.y + e.nativeEvent.layout.height; if (d.current) toChosen(); }}
                  style={d.current ? { borderLeftWidth: 4, borderLeftColor: m2.color.vm } : { borderLeftWidth: 4, borderLeftColor: "transparent" }}>
                  <Press feedback="tint" accessibilityRole="button" accessibilityState={{ selected: d.current }} onPress={() => onPick(d.i)}
                    style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingLeft: m2.space[3], paddingRight: m2.space[4] }}>
                    <Text v="dayRow" color={ink} style={d.current ? { fontFamily: m2.font.bodySb } : null}>{d.label}</Text>
                    <Text v="date" color={d.current ? m2.color.vm : m2.color.slate} style={d.current ? { fontFamily: m2.font.bodyMd } : null}>{d.right}</Text>
                  </Press>
                  {d.meals.length || d.event ? (
                    <View style={{ paddingLeft: 36 - 4, paddingRight: m2.space[4], paddingBottom: 10, marginTop: -4 }}>
                      {d.meals.map((m) => (
                        <View key={m.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                          <Text v="sched" color={m2.color.ink}>{m.label}</Text>
                          <Text v="sched" color={m2.color.slate}>{m.window}</Text>
                        </View>
                      ))}
                      {d.event ? (
                        <Press accessibilityRole="link" onPress={() => Linking.openURL(d.event!.href)}
                          style={{ minHeight: m2.size.tap, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <Text v="rowName" color={m2.color.dm}>{d.event.title}</Text>
                          <Rchev />
                        </Press>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          {s.description ? <Text v="sched" color={m2.color.ink} style={{ marginTop: 20 }}>{s.description}</Text> : null}
        </View>
      </Sheet>
    );
  },
);
