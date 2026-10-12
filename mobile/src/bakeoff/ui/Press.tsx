import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { m2Motion } from "../../lib/motion";
import { m2 } from "../../lib/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** M2's press: finger down within `press.d`, release settles back with no overshoot. `scale` for compact
 * controls, `tint` (a background fill) for full-width rows and bands. */
export function Press({ feedback = "scale", style, onPressIn, onPressOut, ...p }: PressableProps & {
  feedback?: "scale" | "tint";
  style?: StyleProp<ViewStyle>;
}) {
  const down = useSharedValue(0);
  const anim = useAnimatedStyle(() => {
    const d = down.value;
    return feedback === "scale"
      ? { transform: [{ scale: 1 - d * (1 - m2Motion.press.scale) }] }
      : { backgroundColor: d ? m2.color.pressRow : "transparent" };
  });
  const run = (to: 0 | 1) => {
    down.value = withTiming(to, { duration: to ? m2Motion.press.d : m2Motion.settle.d });
  };
  return (
    <AnimatedPressable
      {...p}
      onPressIn={(e) => { run(1); onPressIn?.(e); }}
      onPressOut={(e) => { run(0); onPressOut?.(e); }}
      style={[style, anim]}
    />
  );
}
