import { View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { Band, Board, BusyRow, HallLetter, Header, Photo, Press } from "../ui";
import { boardAt, busyView } from "../logic/busy";
import { loadFixture } from "../logic/fixture";
import { HALL_LX } from "../logic/letters";
import type { PlaceKey } from "../logic/types";
import type { useContainerTransform } from "../motion/useContainerTransform";
import { PHOTO_POS, photoOf } from "../photos";
import { headerHeight } from "./HallsList";

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

const Back = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={m2.color.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
);

/**
 * The hall screen the container transform opens into: a window that grows from the band to the screen. Inside, the
 * screen layer hangs from its photo (the shared element); the band's own copy rides on that photo and fades out,
 * and the title, back button and letter fade in over their final layout.
 */
export function HallHeader({ t, H, place, name, status, onBack }: {
  t: ReturnType<typeof useContainerTransform>; H: number; place: PlaceKey; name: string; status: string; onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const rect = t.rect.current!;
  const compact = place.startsWith("c");
  const src = photoOf(place, name)!;
  const fx = loadFixture();
  const busy = compact ? null : busyView(fx.busy[place as "W"]);
  const letter = compact ? null : <HallLetter letter={place} x={HALL_LX[place as "W"]} top={top + 26} />;
  const ghost = (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: rect.off, height: rect.height }, t.style.outgoing]}>
      <Band ghost compact={compact} name={name} status={status} busy={busy ? <BusyRow lamps={busy.lamps} word={busy.word} /> : undefined}
        letter={compact ? undefined : <HallLetter letter={place} x={HALL_LX[place as "W"]} />} />
    </Animated.View>
  );
  return (
    <View style={fill} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[fill, { backgroundColor: m2.color.scrim }, t.style.scrim]} />
      <GestureDetector gesture={t.dragBack}>
        <Animated.View collapsable={false} onLayout={t.ready} style={[{ position: "absolute", left: 0, right: 0, overflow: "hidden", backgroundColor: m2.color.chalk }, t.style.container]}>
          <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, height: H }, t.style.layer]}>
            <Header
              title={name} status={status} top={top}
              busy={busy ? <BusyRow {...busy} header /> : undefined}
              board={busy ? <Board columns={boardAt(fx.typical[place as "W"], fx.busy[place as "W"], new Date(fx.clock).getHours() * 60 + new Date(fx.clock).getMinutes())} /> : undefined} height={headerHeight(top)}
              photo={<Photo source={src} width={width} height={headerHeight(top)} pos={compact ? 0.5 : PHOTO_POS[place as "W"]} duo={t.style.photo} />}
              letter={<>
                {letter ? <Animated.View pointerEvents="none" style={[fill, t.style.incoming]}>{letter}</Animated.View> : null}
                {ghost}
              </>}
              left={<Press accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: m2.size.tap + 4, height: m2.size.tap + 4, alignItems: "center", justifyContent: "center" }}><Back /></Press>}
              gradStyle={t.style.grad} contentStyle={t.style.incoming}
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
