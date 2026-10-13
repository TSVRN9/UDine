import { useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { m2Motion } from "../../lib/motion";
import { m2 } from "../../lib/theme";

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

/** M2 `.pushing`: the page's leading edge casts this on the screen it covers, only while it moves (`p` strictly between 0 and 1). */
export function pushShadowAt(p: number) {
  "worklet";
  return p > 0 && p < 1 ? m2.shadow.push.map((s) => ({ offsetX: s.x, offsetY: s.y, blurRadius: s.blur, color: s.color })) : [];
}
/** What `MO.push` does to the screen below at push progress `p` (1 = the page is off to the right, 0 = in): shifted left by `shift` of the width, dimmed to `dim`. */
export function pushBelowAt(p: number, width: number) {
  "worklet";
  return { shift: -m2Motion.push.shift * width * (1 - p), dim: m2Motion.push.dim * (1 - p) };
}

/** The push a screen runs under a page it pushes: `p` (starts at 1, the page's owner drives it), the screen's own `below` style and the dim over it. */
export function usePush() {
  const { width } = useWindowDimensions();
  const p = useSharedValue(1);
  const below = useAnimatedStyle(() => ({ transform: [{ translateX: pushBelowAt(p.get(), width).shift }] }));
  const dim = useAnimatedStyle(() => ({ opacity: pushBelowAt(p.get(), width).dim }));
  return { p, below, dim };
}

/** The scrim that dims the screen under a pushed page by `dim`. */
export function PushDim({ dim }: { dim: React.ComponentProps<typeof Animated.View>["style"] }) {
  return <Animated.View testID="push-dim" pointerEvents="none" style={[fill, { backgroundColor: m2.color.scrim }, dim]} />;
}

/** The pushed page's shadow, as a style for the page's own wrapper. */
export function usePushShadow(p: SharedValue<number>) {
  return useAnimatedStyle(() => ({ boxShadow: pushShadowAt(p.get()) }));
}
