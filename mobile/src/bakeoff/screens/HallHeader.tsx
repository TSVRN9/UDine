import { View } from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";
import { m2 } from "../../lib/theme";
import { Band, BusyRow, HallLetter } from "../ui";
import { busyView } from "../logic/busy";
import { loadFixture } from "../logic/fixture";
import { HALL_LX } from "../logic/letters";
import { statusText } from "../logic/status";
import type { ServeTarget } from "../logic/dishSheet";
import type { PlaceKey } from "../logic/types";
import type { useContainerTransform } from "../motion/useContainerTransform";
import { HallMenu } from "./HallMenu";

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

/**
 * The container transform's shell: a window that grows from the band to the screen. Inside, the screen layer hangs from its
 * photo (the shared element); the band's own copy rides on that photo and fades out, and the title, back button, letter and
 * the menu below fade in over their final layout. The menu itself is `HallMenu`.
 */
export function HallHeader({ t, H, place, name, scrollY, onBack, at, onPush, pushed }: {
  t: ReturnType<typeof useContainerTransform>; H: number; place: PlaceKey; name: string; scrollY: SharedValue<number>; onBack: () => void;
  /** a hall pushed from a dish's where-served: its day, meal and dish; `onPush` pushes another such hall from its sheet */
  at?: ServeTarget; onPush?: (t: ServeTarget) => void;
  /** pushed screens have no drag-down (M2 round 7): their way back is the push's own */
  pushed?: boolean;
}) {
  const rect = t.rect.current!;
  const compact = place.startsWith("c");
  const fx = loadFixture();
  const busy = compact ? null : busyView(fx.busy[place as "W"]);
  const ghost = (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: rect.off, height: rect.height }, t.style.outgoing]}>
      <Band ghost compact={compact} name={name} status={statusText(fx.hours[place], new Date(fx.clock))} busy={busy ? <BusyRow lamps={busy.lamps} word={busy.word} /> : undefined}
        letter={compact ? undefined : <HallLetter letter={place as "W"} x={HALL_LX[place as "W"]} />} />
    </Animated.View>
  );
  const window = (
    <Animated.View collapsable={false} onLayout={t.ready} style={[{ position: "absolute", left: 0, right: 0, overflow: "hidden", backgroundColor: m2.color.chalk }, t.style.container]}>
      <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, height: H }, t.style.layer]}>
        <HallMenu t={t} H={H} place={place} name={name} scrollY={scrollY} ghost={ghost} onBack={onBack} at={at} onPush={onPush} />
      </Animated.View>
    </Animated.View>
  );
  return (
    <View style={fill} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[fill, { backgroundColor: m2.color.scrim }, t.style.scrim]} />
      {pushed ? window : <GestureDetector gesture={t.dragBack}>{window}</GestureDetector>}
    </View>
  );
}
