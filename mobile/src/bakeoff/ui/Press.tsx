import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { m2Motion } from "../../lib/motion";
import { m2 } from "../../lib/theme";
import { timed } from "./motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

/** The state layer each surface lays over itself while a finger is down (M2 `.row.down`, `.swbtn.down`, `.band .press`). */
export type Tint = "row" | "onDm" | "band";
const TINT: Record<Tint, string> = { row: m2.color.pressRow, onDm: m2.color.pressOnDm, band: m2.color.pressBand };

/**
 * M2's press: finger down within `press.d`, release settles back with no overshoot. `scale` for compact controls; `tint` for full-width
 * rows and bands lays a state layer of the surface's own colour over the children (it never paints the Pressable, so a caller's ground
 * stays), fading in on `press` and out on `settle`.
 */
export function Press({ feedback = "scale", tint = "row", style, onPressIn, onPressOut, children, ...p }: Omit<PressableProps, "children"> & {
  feedback?: "scale" | "tint";
  tint?: Tint;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const down = useSharedValue(0);
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: 1 - down.get() * (1 - m2Motion.press.scale) }] }));
  const layer = useAnimatedStyle(() => ({ opacity: down.get() }));
  const run = (to: 0 | 1) => { down.set(timed(to, to ? m2Motion.press : m2Motion.settle)); };
  return (
    <AnimatedPressable
      {...p}
      onPressIn={(e) => { run(1); onPressIn?.(e); }}
      onPressOut={(e) => { run(0); onPressOut?.(e); }}
      style={feedback === "scale" ? [style, scale] : style}
    >
      {children}
      {feedback === "tint" ? <Animated.View pointerEvents="none" style={[fill, { backgroundColor: TINT[tint] }, layer]} /> : null}
    </AnimatedPressable>
  );
}
