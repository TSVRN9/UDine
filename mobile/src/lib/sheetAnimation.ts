import { useLayoutEffect, useRef } from "react";
import { Animated } from "react-native";

/**
 * #245 item 5: RN Modal's `animationType="slide"` moves backdrop and sheet together as one
 * subtree, so the scrim visibly slides up with the panel instead of fading in place. Callers use
 * `animationType="none"` and this hook's own Animated.Value instead -- backdrop opacity and panel
 * translateY are driven from the same value but read into two separate style objects, so a
 * caller's `<Animated.View>` backdrop never shares a transform with the panel.
 *
 * Reveal-doesn't-replay bug: RN's `<Modal visible={false}>` unmounts its children (see
 * `Modal.js`'s `_shouldShowModal()`), which unmounts the `Animated.View`s reading `anim` --
 * `AnimatedWithChildren.__removeChild` calls `__detach()` once the last child goes, which (for a
 * `useNativeDriver: true` value) `stopAnimation()`s whatever close animation is in flight and
 * pulls the real *native* value (still ~1, since native-driven animations never sync their
 * per-frame value back into the JS-side `_value` -- see `AnimatedValue.animate`'s comment) back
 * into `_value`. Reopening recreates the native node from that stale `_value` (`__getNativeConfig`
 * seeds `value: this._value`), so the effect below animates 1 -> 1: no visible motion. Same failure
 * mode also fires on a sheet's very first open when a caller mounts it with `visible` already
 * true (CafeSheet: `cafeSheetLoc`/`cafeSheetVisible` are set in the same handler, so it mounts
 * with `visible === true`) -- the old `useRef(new Animated.Value(visible ? 1 : 0))` seeded `anim`
 * already-open before any animation ran. Fix: always seed closed, and force `anim` back to 0 right
 * before animating open, so the reveal always has a real 0 -> 1 to run regardless of what a
 * detach left `_value` holding. `useLayoutEffect`, not `useEffect` (same reasoning as PaneStack's
 * #336 comment) -- the reset must land before paint or the sheet flashes open then slides.
 */
export function useSheetAnim(visible: boolean, panelTravel = 400) {
  const anim = useRef(new Animated.Value(0)).current;

  useLayoutEffect(() => {
    if (visible) anim.setValue(0);
    Animated.timing(anim, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [visible, anim]);

  return {
    backdropStyle: { opacity: anim },
    panelStyle: { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [panelTravel, 0] }) }] },
  };
}
