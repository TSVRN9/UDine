import { useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { durations } from "../lib/motion";

/**
 * Press-feedback rules: a full-width tap zone that's part of a larger card dims via brightness --
 * never scale, which shrinks the strip inside its card and breaks the one-cohesive-card illusion.
 * A free-standing element (button, avatar, standalone card) scales instead.
 */
function usePressAnim(restValue: number, pressedValue: number) {
  const anim = useRef(new Animated.Value(restValue)).current;
  function set(toValue: number) {
    Animated.timing(anim, { toValue, duration: durations.press, easing: Easing.ease, useNativeDriver: true }).start();
  }
  return { anim, onPressIn: () => set(pressedValue), onPressOut: () => set(restValue) };
}

// Plain ReactNode children only -- neither wrapper supports Pressable's function-as-children form
// (it'd need the pressed-state we're already deriving from our own Animated.Value instead).
type WrapperProps = Omit<PressableProps, "style" | "children"> & { style?: StyleProp<ViewStyle>; children: ReactNode };

// A Pressable that can itself carry an Animated style (the scale transform), so there's no extra
// wrapper node between the touchable and its children.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** `.press` -- scale(0.97) on press. Free-standing elements only.
 *
 * One node: Pressable itself carries both the caller's style and the scale transform, with
 * children direct, not wrapped. An inner Animated.View plus an outer Pressable style would put any
 * arrangement style (flexDirection, gap, alignItems) on the Pressable's one real child instead of
 * the actual content, silently stacking what should render as a row. */
export function Press({ style, children, onPressIn, onPressOut, ...props }: WrapperProps) {
  const { anim, onPressIn: scaleIn, onPressOut: scaleOut } = usePressAnim(1, 0.97);
  return (
    <AnimatedPressable
      style={[style, { transform: [{ scale: anim }] }]}
      onPressIn={(e: GestureResponderEvent) => {
        scaleIn();
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        scaleOut();
        onPressOut?.(e);
      }}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * `.pressd` -- `filter: brightness(0.82)` has no RN equivalent. Compositing black at alpha `a`
 * over opaque content gives `C*(1-a)`; brightness(0.82) gives `C*0.82`. So black at 18% opacity
 * (1 - 0.82) is the exact equivalent, layered as a non-interactive overlay. Full-width tap zones
 * that are part of a larger card only.
 */
export function PressDim({ style, children, onPressIn, onPressOut, ...props }: WrapperProps) {
  const { anim, onPressIn: dimIn, onPressOut: dimOut } = usePressAnim(0, 1);
  return (
    <Pressable
      onPressIn={(e) => {
        dimIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        dimOut();
        onPressOut?.(e);
      }}
      style={style}
      {...props}
    >
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }) }]} />
    </Pressable>
  );
}
