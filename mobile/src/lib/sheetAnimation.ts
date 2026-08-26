import { useEffect, useRef } from "react";
import { Animated } from "react-native";

/**
 * #245 item 5: RN Modal's `animationType="slide"` moves backdrop and sheet together as one
 * subtree, so the scrim visibly slides up with the panel instead of fading in place. Callers use
 * `animationType="none"` and this hook's own Animated.Value instead -- backdrop opacity and panel
 * translateY are driven from the same value but read into two separate style objects, so a
 * caller's `<Animated.View>` backdrop never shares a transform with the panel.
 */
export function useSheetAnim(visible: boolean, panelTravel = 400) {
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [visible, anim]);

  return {
    backdropStyle: { opacity: anim },
    panelStyle: { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [panelTravel, 0] }) }] },
  };
}
