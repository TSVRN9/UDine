import { useEffect } from "react";
import { BackHandler } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { m2Motion, m2PushEasing } from "../../lib/motion";
import type { ServeTarget } from "../logic/dishSheet";
import { useContainerTransform } from "../motion/useContainerTransform";
import { HallHeader } from "./HallHeader";

/**
 * A hall pushed over the screen below (M2 round 7 `navPush`): it travels in from the right on the push curve while `p` (shared with
 * the screen below, which shifts and dims by it) runs 1 -> 0, already at its dish. Back, or the hardware back, runs it out again.
 * The screen is a plain hall menu with its container transform already open, so it has none of its own: no drag-down.
 */
export function PushedHall({ at, name, H, W, p, onPop, onPush }: {
  at: ServeTarget; name: string; H: number; W: number; p: SharedValue<number>; onPop: () => void; onPush: (t: ServeTarget) => void;
}) {
  const scrollY = useSharedValue(0);
  const t = useContainerTransform(H, scrollY);
  const going = useSharedValue(false);
  useEffect(() => { t.show({ top: 0, height: H, off: 0 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    if (going.get()) return;
    going.set(true);
    p.set(withTiming(1, { duration: m2Motion.contBack.d, easing: m2PushEasing }, (done) => { if (done) runOnJS(onPop)(); }));
  };
  // declared after the transform's own handler, so it runs first: back pops this screen rather than closing the hall below
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { back(); return true; });
    return () => sub.remove();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: p.get() * W }] }));
  // the push's clock starts once the menu has drawn: HallMenu mounts its list one frame after itself, and that blocks JS for a few frames
  const open = t.phase !== "closed";
  useEffect(() => {
    if (!open) return;
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => { if (!going.get()) p.set(withTiming(0, { duration: m2Motion.cont.d, easing: m2PushEasing })); }); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, slide]}>
      {t.phase !== "closed" ? <HallHeader t={t} H={H} place={at.place} name={name} scrollY={scrollY} onBack={back} at={at} onPush={onPush} pushed /> : null}
    </Animated.View>
  );
}
