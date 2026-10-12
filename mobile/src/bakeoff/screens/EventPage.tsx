import { useMemo } from "react";
import { Image, Linking, View } from "react-native";
import { m2 } from "../../lib/theme";
import { Press, Text } from "../ui";
import { loadFixture } from "../logic/fixture";
import { EVENT_PHOTO } from "../photos";
import { PushPage } from "./PushPage";

const fx = loadFixture();

/**
 * M2's event page (`pageContent('event')`) for a banner event: the deep-maroon card's ground throughout, the bar with only Back (the banner is
 * the title), the banner framed in felt with gold stitching run in the felt around it, the date in gold, then one button per link: the
 * first gold, the rest outlined. The group sits at the optical centre of what the bar leaves. It is pushed from the right like every page.
 */
export function EventPage({ i, progress, onPop }: { i: number; progress: Parameters<typeof PushPage>[0]["progress"]; onPop: () => void }) {
  const e = fx.events[i];
  const when = useMemo(() => new Date(e.expires * 1000).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }), [e]);
  const photo = EVENT_PHOTO[e.title];
  return (
    <PushPage onPop={onPop} progress={progress} ground={m2.color.dm} poster>
      <View style={{ paddingTop: m2.space.eventTop, paddingBottom: m2.space.cafeBodyTop }}>
        {photo ? (
          // the white ring is outside the patch (M2 `box-shadow: 0 0 0 3px`), so it takes no room
          <View accessibilityLabel={e.title} accessible style={{ marginHorizontal: -3, padding: 3, borderRadius: m2.radius.card + 3, backgroundColor: m2.color.white }}>
            <View style={{ aspectRatio: 1024 / 432, borderRadius: m2.radius.card, padding: 7, overflow: "hidden", backgroundColor: m2.color.vm }}>
              <Image source={photo} resizeMode="cover" style={{ width: "100%", height: "100%", borderRadius: 2 }} />
              <View pointerEvents="none" style={{ position: "absolute", top: 2.5, left: 2.5, right: 2.5, bottom: 2.5, borderRadius: 3, borderWidth: 1.5, borderStyle: "dashed", borderColor: m2.color.stitchGold }} />
            </View>
          </View>
        ) : null}
        <Text v="barNum" color={m2.color.gold} style={{ paddingTop: m2.space.eventDate }}>{when}</Text>
        <View style={{ marginTop: m2.space.group, gap: m2.space.eventLinks }}>
          {e.links.map(([label, url], k) => (
            <Press key={label} accessibilityRole="link" onPress={() => Linking.openURL(url)}
              style={[{ height: 52, borderRadius: m2.radius.button, alignItems: "center", justifyContent: "center" },
                k ? { borderWidth: 1.5, borderColor: m2.color.outline } : { backgroundColor: m2.color.gold }]}>
              <Text v="action" color={k ? m2.color.white : m2.color.dm}>{label}</Text>
            </Press>
          ))}
        </View>
      </View>
    </PushPage>
  );
}
