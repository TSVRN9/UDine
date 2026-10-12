import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import { timed } from "./motion";

/**
 * M2 `.dish.stuck .dhd`: the edge a pinned header gets once something scrolls under it, a 1 dp hair and a soft shadow
 * (0 10px 14px -8px at 32%), fading in on `settle`. Sits at the header's bottom edge; `on` is 0 or 1 (the scroll > 4 dp).
 * `room` is the descender room under the header's text (Text gives it back as a negative margin, so the glyphs hang below the header's
 * box): the edge starts below it, over a chalk fill, so the rule never cuts through a `g`.
 */
export function ScrollEdge({ on, room = 0 }: { on: SharedValue<number>; room?: number }) {
  const style = useAnimatedStyle(() => ({ opacity: timed(on.get(), m2Motion.settle) }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, bottom: -(m2.size.edgeShadow + room), height: m2.size.edgeShadow + 1 + room }, style]}>
      <Svg width="100%" height={m2.size.edgeShadow + 1 + room}>
        <Defs>
          <LinearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={m2.color.scrim} stopOpacity={m2.opacity.edgeShadow} />
            <Stop offset="1" stopColor={m2.color.scrim} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height={room} fill={m2.color.chalk} />
        <Rect x={0} y={room + 1} width="100%" height={m2.size.edgeShadow} fill="url(#edge)" />
        <Rect x={0} y={room} width="100%" height={1} fill={m2.color.hair} />
      </Svg>
    </Animated.View>
  );
}
