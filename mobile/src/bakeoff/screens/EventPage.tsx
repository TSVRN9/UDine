import { useMemo } from "react";
import { Image, Linking, View } from "react-native";
import { m2 } from "../../lib/theme";
import { Press, Text } from "../ui";
import { Felt } from "../ui/Felt";
import { loadFixture } from "../logic/fixture";
import { EVENT_PHOTO } from "../photos";
import { PushPage } from "./PushPage";

const fx = loadFixture();
// the banners are 1024 x 432 (M2 `.evpatch{aspect-ratio:1024/432}`)
const BANNER = 1024 / 432;

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
          <View accessibilityLabel={e.title} accessible style={{ marginHorizontal: -m2.size.ring, padding: m2.size.ring, borderRadius: m2.radius.card + m2.size.ring, backgroundColor: m2.color.white }}>
            <Felt kind="frame" style={{ aspectRatio: BANNER }}>
              <Image source={photo} resizeMode="cover" style={{ width: "100%", height: "100%", borderRadius: m2.radius.image }} />
            </Felt>
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
