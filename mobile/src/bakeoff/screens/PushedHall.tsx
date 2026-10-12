import { useEffect, useRef } from "react";
import { BackHandler } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { m2Motion } from "../../lib/motion";
import { timed, useMotion } from "../ui/motion";
import { usePushShadow } from "../ui/push";
import type { ServeTarget } from "../logic/dishSheet";
import { closedGate, gateStep } from "../motion/pushGate";
import { useContainerTransform } from "../motion/useContainerTransform";
import { HallHeader } from "./HallHeader";

/**
 * A hall pushed over the screen below (M2 round 7 `navPush`): it travels in from the right on the push curve while `p` (shared with
 * the screen below, which shifts and dims by it) runs 1 -> 0, already at its dish: it is drawn and scrolled out of sight first. Back, or the hardware back, runs it out again.
 * The screen is a plain hall menu with its container transform already open, so it has none of its own: no drag-down.
 */
export function PushedHall({ at, name, H, W, p, go, onPop, onPush, onPushGo }: {
  at: ServeTarget; name: string; H: number; W: number; p: SharedValue<number>; go: boolean; onPop: () => void; onPush: (t: ServeTarget) => void; onPushGo: () => void;
}) {
  const scrollY = useSharedValue(0);
  const t = useContainerTransform(H, scrollY);
  const going = useSharedValue(false);
  // reduced motion (M2 `RM`): in at once and crossfaded in and out
  const { reduced } = useMotion();
  const fade = useSharedValue(reduced ? 0 : 1);
  useEffect(() => { t.show({ top: 0, height: H, off: 0 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    if (going.get()) return;
    going.set(true);
    if (reduced) { fade.set(timed(0, m2Motion.rmFade, (done) => { "worklet"; p.set(1); if (done) runOnJS(onPop)(); })); return; }
    p.set(timed(1, m2Motion.pushOut, (done) => { if (done) runOnJS(onPop)(); }));
  };
  // declared after the transform's own handler, so it runs first: back pops this screen rather than closing the hall below
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { back(); return true; });
    return () => sub.remove();
  });  

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: p.get() * W }] }));
  const cast = usePushShadow(p);
  const crossfade = useAnimatedStyle(() => ({ opacity: fade.get() }));
  // Out of sight (p = 1) the screen draws and scrolls to its dish; it moves once that is done and the sheet is half-way out (pushGate)
  const gate = useRef(closedGate);
  const step = (e: "settled" | "go") => {
    const r = gateStep(gate.current, e);
    gate.current = r.gate;
    if (!r.start || going.get()) return;
    if (reduced) { p.set(0); fade.set(timed(1, m2Motion.rmFade)); } else p.set(timed(0, m2Motion.pushIn));
  };
  // a pushed hall that never reports settled (or whose sheet never reports half-way) is let go after the watchdog, so it cannot
  // stay mounted off to the right and take the first hardware back press
  useEffect(() => {
    const id = setTimeout(() => { step("settled"); step("go"); }, m2Motion.pushWatchdog.d);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = t.phase !== "closed";
  useEffect(() => { if (go) step("go"); }, [go]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, slide, cast, crossfade]}>
      {open ? <HallHeader t={t} H={H} place={at.place} name={name} scrollY={scrollY} onBack={back} at={at} onPush={onPush} onPushGo={onPushGo} onSettled={() => step("settled")} pushed /> : null}
    </Animated.View>
  );
}
