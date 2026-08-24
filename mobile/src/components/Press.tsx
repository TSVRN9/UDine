import { useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

/**
 * Press-feedback rules (#179, owner round-2 decision): a full-width tap zone that's part of a
 * larger card (hall-card header zones, grab-n-go strips) dims via brightness -- NEVER scale, which
 * shrinks the strip inside its card and breaks the one-cohesive-card illusion. A free-standing
 * element (button, avatar, standalone card) scales instead. Both animate over the artboard's
 * 120ms ease (`.press` / `.pressd` in the styling spec).
 */
const PRESS_MS = 120;

function usePressAnim(restValue: number, pressedValue: number) {
  const anim = useRef(new Animated.Value(restValue)).current;
  function set(toValue: number) {
    Animated.timing(anim, { toValue, duration: PRESS_MS, easing: Easing.ease, useNativeDriver: true }).start();
  }
  return { anim, onPressIn: () => set(pressedValue), onPressOut: () => set(restValue) };
}

// Plain ReactNode children only -- neither wrapper supports Pressable's function-as-children form
// (it'd need the pressed-state we're already deriving from our own Animated.Value instead).
type WrapperProps = Omit<PressableProps, "style" | "children"> & { style?: StyleProp<ViewStyle>; children: ReactNode };

// A Pressable that can itself carry an Animated style (the scale transform), so there's no extra
// wrapper node between the touchable and its children -- see Press's own doc comment for why that
// extra node was wrong, not just superfluous.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** `.press` -- scale(0.97) on press. Free-standing elements only.
 *
 * One node: `Pressable` itself carries both the caller's `style` and the scale transform, with
 * `children` direct (not wrapped). An earlier version put the transform on a separate inner
 * `Animated.View` and the caller's `style` on the outer `Pressable` -- style ended up on the right
 * node for *box* properties (width/height/padding/flex/margin), but any *arrangement* style over
 * multiple children (`flexDirection`, `gap`, `alignItems`) then governed the Pressable's one real
 * child (that inner wrapper) instead of the actual content, silently stacking what should have
 * been a row -- caught on-device: YouPane's `ALL LOGS ›` link (`allLogsLink: { flexDirection:
 * "row", ... }`) rendered as two stacked lines instead of one. Collapsing to a single node removes
 * the node the arrangement style was accidentally governing, rather than picking a level to put it
 * on -- there's no split left to get wrong. */
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

/** The disjoint-sibling case: the tap target and the content that should dim aren't the same
 * subtree (e.g. HomePane's hall zone, where a sibling absolute-fill Pressable is the hit target so
 * the two touch zones don't nest -- see that file's own comment), so PressDim's wrap-children
 * shape doesn't fit. Exposes the raw handlers + overlay style so the caller can place the scrim
 * itself, same 0.82-brightness/18%-black-overlay equivalence as PressDim above. */
export function usePressDimOverlay() {
  const { anim, onPressIn, onPressOut } = usePressAnim(0, 1);
  return {
    onPressIn,
    onPressOut,
    overlayStyle: { backgroundColor: "#000", opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }) },
  };
}
