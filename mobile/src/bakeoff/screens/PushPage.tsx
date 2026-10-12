import { useEffect, useState, type ReactNode } from "react";
import { BackHandler, ScrollView, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { m2Motion, m2PushEasing } from "../../lib/motion";
import { Press, Text } from "../ui";
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
  const [leaving, setLeaving] = useState(false);
  const gone = useSharedValue(false);

  const leave = (from: number) => {
    if (gone.get()) return;
    gone.set(true);
    setLeaving(true);
    p.set(withTiming(1, { duration: m2Motion.contBack.d * (1 - from), easing: m2PushEasing }, (done) => { if (done) runOnJS(onPop)(); }));
  };
  useEffect(() => {
    p.set(withTiming(0, { duration: m2Motion.cont.d, easing: m2PushEasing }));
    return () => cancelAnimation(p);
  }, [p]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { leave(p.get()); return true; });
    return () => sub.remove();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const swipe = useEdgeSwipeBack({
    enabled: !leaving,
    onGrab: () => { "worklet"; cancelAnimation(p); },
    onMove: (d) => { "worklet"; p.set(clamp(d / W)); },
    onRelease: (d, v) => {
      "worklet";
      const q = clamp(d / W);
      if (q > m2Motion.push.commit || v > m2Motion.dragBack.flick) runOnJS(leave)(q);
      else p.set(withTiming(0, { duration: m2Motion.cont.d * q, easing: m2PushEasing }));
    },
  });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: p.get() * W }] }));
  return (
    <GestureDetector gesture={swipe as ReturnType<typeof Gesture.Pan>}>
      <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: ground ?? m2.color.chalk }, slide]}>
        <View style={{ height: top + 52, paddingTop: top, paddingHorizontal: m2.space[0], flexDirection: "row", alignItems: "center", backgroundColor: ground ?? m2.color.vm }}>
          <Press accessibilityRole="button" accessibilityLabel="Back" onPress={() => leave(p.get())} style={{ width: m2.size.tap + 4, height: m2.size.tap + 4, alignItems: "center", justifyContent: "center" }}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={m2.color.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
          </Press>
          {title ? <Text v="section" color={m2.color.white} numberOfLines={1} accessibilityRole="header" style={{ flex: 1, paddingRight: m2.space[3] }}>{title}</Text> : null}
        </View>
        <ScrollView contentContainerStyle={poster
          ? { flexGrow: 1, justifyContent: "center", paddingHorizontal: m2.space[4], paddingBottom: 56 }
          : { paddingHorizontal: m2.space[4], paddingTop: m2.space[1], paddingBottom: 120 }}>{children}</ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}
