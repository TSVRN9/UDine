import { forwardRef } from "react";
import { Linking, Platform, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { SharedValue } from "react-native-reanimated";
import { m2 } from "../../lib/theme";
import { Button, Press, Sheet, Text } from "../ui";
import { RowChevron } from "../ui/Chevron";
import { openOffset, type Schedule } from "../logic/schedule";

const mapsUrl = (ll: string, name: string) =>
  Platform.OS === "ios" ? `https://maps.apple.com/?ll=${ll}&q=${encodeURIComponent(name)}` : `https://www.google.com/maps/search/?api=1&query=${ll}`;

const GRAB = 22;

/**
 * M2's schedule (round 9): where the place is, then the days in date order with the chosen one open in place. A day row
 * picks that day; opened on a later day it scrolls just enough that the chosen day and its hours are on screen at rest.
 */
export const HoursSheet = forwardRef<BottomSheetModal, { s: Schedule; maxHeight: number; onPick: (i: number) => void; onDismiss: () => void; animatedPosition?: SharedValue<number> }>(
  function HoursSheet({ s, maxHeight, onPick, onDismiss, animatedPosition }, ref) {
    const offset = openOffset(s, maxHeight - GRAB);
    return (
      <Sheet ref={ref} maxHeight={maxHeight} onDismiss={onDismiss} contentOffset={offset} animatedPosition={animatedPosition}>
        <View>
          <Text v="schedHead" color={m2.color.dm} style={{ marginTop: m2.space.schedNameTop }}>{s.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: m2.space.panel, marginTop: m2.space.schedGap }}>
            <View style={{ flex: 1 }}>
              <Text v="sched" color={m2.color.slate}>{s.address}</Text>
              {s.building ? <Text v="sched" color={m2.color.slate}>{s.building}</Text> : null}
            </View>
            {s.mapAddress ? (
              <Button kind="line" size="md" label="Directions" accessibilityRole="link" accessibilityLabel="Directions" onPress={() => Linking.openURL(mapsUrl(s.mapAddress!, s.name))} />
            ) : null}
          </View>
          {s.payment ? (
            <Text v="sched" color={m2.color.slate} style={{ marginTop: m2.space.schedPayTop }}><Text v="link" color={m2.color.dm}>Payment  </Text>{s.payment}</Text>
          ) : null}
          <View accessibilityRole="list" style={{ marginTop: m2.space.action, marginHorizontal: -m2.space.gutter, borderTopWidth: 1, borderTopColor: m2.color.hair }}>
            {s.days.map((d) => {
              const ink = d.current ? m2.color.vm : m2.color.ink;
              return (
                <View key={d.i}
                  style={{ borderLeftWidth: m2.size.curBar, borderLeftColor: d.current ? m2.color.vm : "transparent" }}>
                  <Press feedback="tint" accessibilityRole="button" accessibilityState={{ selected: d.current }} onPress={() => onPick(d.i)}
                    style={{ minHeight: m2.size.listRow, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: m2.space.panel, paddingLeft: m2.space.action, paddingRight: m2.space.gutter }}>
                    <Text v="dayRow" color={ink} style={d.current ? { fontFamily: m2.font.bodySb } : null}>{d.label}</Text>
                    <Text v="date" color={d.current ? m2.color.vm : m2.color.slate} style={d.current ? { fontFamily: m2.font.bodyMd } : null}>{d.right}</Text>
                  </Press>
                  {d.meals.length || d.event ? (
                    <View style={{ paddingLeft: m2.space.mwsStart, paddingRight: m2.space.gutter, paddingBottom: m2.space.mwsBottom, marginTop: -m2.space.line }}>
                      {d.meals.map((m) => (
                        <View key={m.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: m2.space.panel }}>
                          <Text v="sched" color={m2.color.ink}>{m.label}</Text>
                          <Text v="sched" color={m2.color.slate}>{m.window}</Text>
                        </View>
                      ))}
                      {d.event ? (
                        <Press accessibilityRole="link" onPress={() => Linking.openURL(d.event!.href)}
                          style={{ minHeight: m2.size.tap, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <Text v="rowName" color={m2.color.dm}>{d.event.title}</Text>
                          <RowChevron size={m2.size.chevronSm} />
                        </Press>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          {s.description ? <Text v="sched" color={m2.color.ink} style={{ marginTop: m2.space.dayBlock }}>{s.description}</Text> : null}
        </View>
      </Sheet>
    );
  },
);
