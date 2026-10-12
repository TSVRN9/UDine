import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { m2Motion } from "../../lib/motion";
import { timed, useMotion } from "../ui/motion";
import { incomingOpacity, outgoingOpacity, settleTarget, transition, type Event, type Machine } from "./containerMath";
import { useEdgeSwipeBack } from "./useEdgeSwipeBack";

/** The tapped band in the overlay's coordinates; `off` is where its window into the header photo starts (px). */
export interface BandRect { top: number; height: number; off: number }

const clamp01 = (x: number) => {
  "worklet";
  return Math.min(1, Math.max(0, x));
};

/**
 * One shared value `progress` (0 = band, 1 = menu) drives every animated style, as M2's `paint(p)`: the container
 * window grows from the band's rect to the screen, the screen layer hangs from its photo so the photo stays where the
 * band showed it, outgoing content (the band's copy) fades by `contFade`, incoming content fades in after it.
 * `height` is the overlay's height (the scene above the tab bar).
 */
export function useContainerTransform(height: number, scrollY?: SharedValue<number>) {
  const progress = useSharedValue(0);
  // reduced motion (M2 `RM`): nothing grows or shrinks; the screen is there at once and crossfades in and out where it is
  const { reduced } = useMotion();
  const fade = useSharedValue(1);
  const Hs = useSharedValue(height);
  useEffect(() => { Hs.set(height); }, [Hs, height]);
  const T = useSharedValue(0), BH = useSharedValue(0), Y0 = useSharedValue(0);
  const [machine, setMachine] = useState<Machine>({ phase: "closed", run: 0 });
  const ref = useRef(machine);
  const rect = useRef<BandRect | null>(null);
  const waiting = useRef<(() => void) | null>(null);

  const send = useCallback((e: Event): Machine => {
    const next = transition(ref.current, e);
    if (next !== ref.current) { ref.current = next; setMachine(next); }
    return next;
  }, []);

  // Runs progress to `to` over `ms`; only the run that is still current may finish the machine.
  const runTo = useCallback((to: 0 | 1, ms: number, run: number) => {
    if (reduced) {
      // M2 `paint(1, 0)`, then `A(menu, opacity, 'settle')`: the way out fades first and collapses once it is gone
      if (to) progress.set(1);
      fade.set(timed(to, m2Motion.rmFade, (finished) => {
        "worklet";
        if (!to) { progress.set(0); fade.set(1); }
        if (finished) runOnJS(send)({ type: "done", run });
      }));
      return;
    }
    progress.set(timed(to, { d: ms, e: m2Motion.cont.e }, (finished) => {
      if (finished) runOnJS(send)({ type: "done", run });
    }));
  }, [progress, fade, send, reduced]);

  const open = useCallback((from?: BandRect) => {
    const was = ref.current.phase;
    if (was === "closed") {
      if (!from) return;
      if (reduced) fade.set(0);
      rect.current = from;
      T.set(from.top); BH.set(from.height); Y0.set(from.top - from.off);
    }
    const next = send({ type: "open" });
    if (next.phase !== "opening") return;
    const go = () => ref.current.run === next.run && runTo(1, m2Motion.cont.d * (1 - progress.get()), next.run);
    // a fresh overlay is still mounting: its first frame must be the band, so the clock starts at `ready`
    if (was === "closed") waiting.current = go;
    else go();
  }, [T, BH, Y0, progress, fade, reduced, send, runTo]);
  /** Dev only (screenshots): the screen already open, no motion. */
  const show = useCallback((from: BandRect) => {
    rect.current = from;
    T.set(from.top); BH.set(from.height); Y0.set(from.top - from.off);
    const next = send({ type: "open" });
    progress.set(1);
    send({ type: "done", run: next.run });
  }, [T, BH, Y0, progress, send]);
  const ready = useCallback(() => { const go = waiting.current; waiting.current = null; go?.(); }, []);

  const close = useCallback(() => {
    const next = send({ type: "close" });
    if (next.phase === "closing") runTo(0, m2Motion.contBack.d * progress.get(), next.run);
  }, [progress, send, runTo]);

  useEffect(() => {
    if (machine.phase === "closed") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => sub.remove();
  }, [machine.phase, close]);

  const grab = useCallback(() => { send({ type: "grab" }); }, [send]);
  const release = useCallback((to: "open" | "closed") => {
    const next = send({ type: "release", to });
    const p = progress.get();
    if (next.phase === "closing") runTo(0, m2Motion.contBack.d * p, next.run);
    else if (next.phase === "opening") runTo(1, m2Motion.cont.d * (1 - p), next.run);
  }, [progress, send, runTo]);

  const dragBack = useEdgeSwipeBack({
    enabled: machine.phase !== "closed" && !reduced, scrollY,
    onGrab: () => {
      "worklet";
      cancelAnimation(progress);
      runOnJS(grab)();
    },
    onMove: (d) => {
      "worklet";
      progress.set(clamp01(1 - d / m2Motion.dragBack.dist));
    },
    onRelease: (d, v) => {
      "worklet";
      runOnJS(release)(settleTarget(v, clamp01(1 - d / m2Motion.dragBack.dist)));
    },
  });

  const container = useAnimatedStyle(() => {
    const q = 1 - progress.value, top = T.value * q, bottom = Hs.value - q * (Hs.value - T.value - BH.value);
    return { top, height: bottom - top };
  });
  const layer = useAnimatedStyle(() => {
    const q = 1 - progress.value;
    return { transform: [{ translateY: Y0.value * q - T.value * q }] };
  });
  const photo = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const grad = useAnimatedStyle(() => ({ opacity: progress.value }));
  const outgoing = useAnimatedStyle(() => ({ opacity: outgoingOpacity(progress.value) }));
  const incoming = useAnimatedStyle(() => ({ opacity: incomingOpacity(progress.value) }));
  const crossfade = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const scrim = useAnimatedStyle(() => ({ opacity: m2Motion.scrim * progress.value }));

  return { phase: machine.phase, progress, rect, open, show, close, ready, dragBack, style: { container, layer, photo, grad, outgoing, incoming, scrim, crossfade } };
}
