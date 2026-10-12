import Animated, { useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { m2 } from "../../lib/theme";
import { m2Motion, m2SettleEasing } from "../../lib/motion";

/**
 * M2 `.dish.stuck .dhd`: the edge a pinned header gets once something scrolls under it, a 1 dp hair and a soft shadow
 * (0 10px 14px -8px at 32%), fading in on `settle`. Sits at the header's bottom edge; `on` is 0 or 1 (the scroll > 4 dp).
 */
export function ScrollEdge({ on }: { on: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: withTiming(on.get(), { duration: m2Motion.settle.d, easing: m2SettleEasing }) }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, bottom: -10, height: 11 }, style]}>
      <Svg width="100%" height={11}>
        <Defs>
          <LinearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="rgb(36,10,14)" stopOpacity={0.3} />
            <Stop offset="1" stopColor="rgb(36,10,14)" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={1} width="100%" height={10} fill="url(#edge)" />
        <Rect x={0} y={0} width="100%" height={1} fill={m2.color.hair} />
      </Svg>
    </Animated.View>
  );
}
