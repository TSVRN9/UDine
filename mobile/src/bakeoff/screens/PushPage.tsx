import { useEffect, useState, type ReactNode } from "react";
import { BackHandler, ScrollView, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import { BackButton, Text } from "../ui";
import { part, timed, useMotion } from "../ui/motion";
import { usePushShadow } from "../ui/push";
import { useEdgeSwipeBack } from "../motion/useEdgeSwipeBack";

const clamp = (x: number) => {
  "worklet";
  return Math.min(1, Math.max(0, x));
};

/**
 * M2 `navPush` for a You row: a page that travels in from the right on the push curve, with the maroon page bar (Back and its title) and
 * a body that scrolls. Back, the hardware back and an edge swipe that follows the finger all leave the same way; only one leave runs, and a
 * swipe that takes hold during the arrival stops it where it is.
 */
export function PushPage({ title, onPop, children, progress, ground, poster }: {
  title?: string; onPop: () => void; children: ReactNode;
  /** the push (1 = off to the right, 0 = in) when the screen below shifts and dims by it; its owner starts it at 1 */
  progress?: SharedValue<number>;
  /** the page's ground and bar, when it is not chalk under a maroon bar (an event's page is the card's deep maroon throughout) */
  ground?: string;
  /** the body is a poster: its group sits at the optical centre of what the bar leaves */
  poster?: boolean;
}) {
  const { width: W } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const own = useSharedValue(1);
  const p = progress ?? own;
  // reduced motion (M2 `RM`): the page is in at once and crossfades in and out; no edge swipe
  const { reduced } = useMotion();
  const fade = useSharedValue(reduced ? 0 : 1);
  const [leaving, setLeaving] = useState(false);
  const gone = useSharedValue(false);

  const leave = (from: number) => {
    if (gone.get()) return;
    gone.set(true);
    setLeaving(true);
    if (reduced) {
      fade.set(timed(0, m2Motion.rmFade, (done) => { "worklet"; p.set(1); if (done) runOnJS(onPop)(); }));
      return;
    }
    p.set(timed(1, part(m2Motion.pushOut, 1 - from), (done) => { if (done) runOnJS(onPop)(); }));
  };
  useEffect(() => {
    if (reduced) { p.set(0); fade.set(timed(1, m2Motion.rmFade)); } else p.set(timed(0, m2Motion.pushIn));
    return () => cancelAnimation(p);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { leave(p.get()); return true; });
    return () => sub.remove();
  });  

  const swipe = useEdgeSwipeBack({
    enabled: !leaving && !reduced,
    onGrab: () => { "worklet"; cancelAnimation(p); },
    onMove: (d) => { "worklet"; p.set(clamp(d / W)); },
    onRelease: (d, v) => {
      "worklet";
      const q = clamp(d / W);
      if (q > m2Motion.push.commit || v > m2Motion.dragBack.flick) runOnJS(leave)(q);
      else p.set(timed(0, part(m2Motion.pushIn, q)));
    },
  });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: p.get() * W }] }));
  const cast = usePushShadow(p);
  const crossfade = useAnimatedStyle(() => ({ opacity: fade.get() }));
  return (
    <GestureDetector gesture={swipe as ReturnType<typeof Gesture.Pan>}>
      <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: ground ?? m2.color.chalk }, slide, cast, crossfade]}>
        <View style={{ height: top + m2.size.bar, paddingTop: top, paddingHorizontal: m2.space.line, flexDirection: "row", alignItems: "center", backgroundColor: ground ?? m2.color.vm }}>
          <BackButton onPress={() => leave(p.get())} />
          {title ? <Text v="section" color={m2.color.white} numberOfLines={1} accessibilityRole="header" style={{ flex: 1, paddingRight: m2.space.action }}>{title}</Text> : null}
        </View>
        <ScrollView contentContainerStyle={poster
          ? { flexGrow: 1, justifyContent: "center", paddingHorizontal: m2.space.gutter, paddingBottom: m2.size.posterFoot }
          : { paddingHorizontal: m2.space.gutter, paddingTop: m2.space.part, paddingBottom: m2.size.listFoot }}>{children}</ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}
