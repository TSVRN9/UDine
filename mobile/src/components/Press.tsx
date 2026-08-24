import { useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

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

/** `.press` -- scale(0.97) on press. Free-standing elements only.
 *
 * `style` goes on the outer `Pressable`, not the inner animated wrapper -- a caller's style
 * routinely carries layout (Button.tsx's `exportButton: { flex: 1 }`, `choiceButton: {
 * marginBottom }`, PaneHeader's `dotTapTarget: { width, height, alignItems: "center",
 * justifyContent: "center" }`), and `flex`/`margin`/explicit sizing/alignment only take effect
 * on a node that's actually a flex participant in its parent -- an auto-sized inner child ignores
 * them silently (Yoga only grows a flexible child into space its *own* parent already has, and
 * only that parent's `alignItems`/`justifyContent` position it). That would have quietly broken
 * every `<Button style={{ flex: 1 }}>` row on this rewrite, and left the header dots off-center.
 * The inner `Animated.View` carries only the transform and no size/layout style of its own -- RN's
 * ordinary default sizing (shrink-to-content, `alignItems: "stretch"` unless the Pressable
 * overrides it) applies to it exactly as it would to a plain nested `View`, so callers that rely
 * on that default (a full-width Card child, e.g.) see no change either. */
export function Press({ style, children, onPressIn, onPressOut, ...props }: WrapperProps) {
  const { anim, onPressIn: scaleIn, onPressOut: scaleOut } = usePressAnim(1, 0.97);
  return (
    <Pressable
      style={style}
      onPressIn={(e) => {
        scaleIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scaleOut();
        onPressOut?.(e);
      }}
      {...props}
    >
      <Animated.View style={{ transform: [{ scale: anim }] }}>{children}</Animated.View>
    </Pressable>
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
