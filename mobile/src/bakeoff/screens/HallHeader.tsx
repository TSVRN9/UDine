import { useState } from "react";
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
import { getNet, hoursKnown, liveKnown } from "../state/net";
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
export function HallHeader({ t, H, place, name, scrollY, onBack, at, onPush, onPushGo, onSettled, pushed, onEvent }: {
  t: ReturnType<typeof useContainerTransform>; H: number; place: PlaceKey; name: string; scrollY: SharedValue<number>; onBack: () => void;
  /** a hall pushed from a dish's where-served: its day, meal and dish; `onPush` pushes another such hall from its sheet */
  at?: ServeTarget; onPush?: (t: ServeTarget) => void; onPushGo?: () => void; onSettled?: () => void;
  /** pushed screens have no drag-down (M2 round 7): their way back is the push's own */
  pushed?: boolean;
  /** the holiday note on the list opens its event page */
  onEvent?: (i: number) => void;
}) {
  const rect = t.rect.current!;
  const compact = place.startsWith("c");
  const fx = loadFixture();
  // the band's copy shows what the band showed: no status or busy the network has not given it
  // what the band showed when it was tapped, once: the copy never re-renders for a later network change (it is a layer the container's own
  // progress has already faded out, and a commit under it redraws it as the band)
  const [net] = useState(getNet);
  const busy = compact || !liveKnown(net) ? null : busyView(fx.busy[place as "W"]);
  // Once the screen is open the copy is faded out for good, and it is not drawn at all: a commit under a layer whose opacity only the
  // UI thread has moved (a network arrival re-rendering the list beside it) put it back on screen, double-exposing the title.
  const ghost = t.phase === "open" ? null : (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: rect.off, height: rect.height }, t.style.outgoing]}>
      <Band ghost compact={compact} name={name} status={hoursKnown(net) ? statusText(fx.hours[place], new Date(fx.clock)) : undefined} busy={busy ? <BusyRow lamps={busy.lamps} word={busy.word} /> : undefined}
        letter={compact ? undefined : <HallLetter letter={place as "W"} x={HALL_LX[place as "W"]} />} />
    </Animated.View>
  );
  const window = (
    <Animated.View collapsable={false} onLayout={t.ready} style={[{ position: "absolute", left: 0, right: 0, overflow: "hidden", backgroundColor: m2.color.chalk }, t.style.container, t.style.crossfade]}>
      <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, height: H }, t.style.layer]}>
        <HallMenu t={t} H={H} place={place} name={name} scrollY={scrollY} ghost={ghost} onBack={onBack} at={at} onPush={onPush} onPushGo={onPushGo} onSettled={onSettled} onEvent={onEvent} />
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
