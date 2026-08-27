import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { colors, fs, withOpacity } from "../../lib/theme";

// Toggle track/knob geometry, verbatim from the Privacy/ExportChecklist artboards' shared
// "Toggle (exact, used everywhere on this screen)" spec: 44x26 track, 22px knob, ON translateX(18).
// Routed through fs() per the issue's own instruction -- these are 390dp-reference control
// dimensions, same treatment as PlateBar's fs(48) LOG button height, not a second scaling
// mechanism. Motion (#245 item 1): track background 180ms ease, knob transform 180ms
// cubic-bezier(0.22, 0.61, 0.36, 1) -- the artboard's own "Motion (from Prototype)" spec, applied
// now that #220 established Animated as this app's precedent (superseding #211's "no other screen
// animates" deviation).
const TRACK_W = 44;
const TRACK_H = 26;
const KNOB = 22;
const KNOB_TRAVEL = 18;
const DURATION = 180;
const KNOB_EASING = Easing.bezier(0.22, 0.61, 0.36, 1);

interface Props {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Custom track+knob toggle -- RN's native `Switch` can't be pinned to the artboard's exact
 * 44x26/22px geometry across platforms, so this is a plain styled View instead (no new
 * dependency: react-native-svg isn't in this project, per login.tsx/halls/[slug].tsx's own
 * precedent of avoiding it for decorative chrome). */
export function Toggle({ value, onValueChange, disabled, accessibilityLabel }: Props) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: DURATION,
      easing: KNOB_EASING,
      useNativeDriver: false, // backgroundColor interpolation isn't supported by the native driver
    }).start();
  }, [value, anim]);

  const trackBackgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [withOpacity(colors.ink900, 15), colors.maroon600],
  });
  const knobTranslateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, fs(KNOB_TRAVEL)] });

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackBackgroundColor }]}>
        <Animated.View style={[styles.knob, !value && styles.knobOff, { transform: [{ translateX: knobTranslateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: fs(TRACK_W), height: fs(TRACK_H), borderRadius: 999, padding: fs(2), justifyContent: "center" },
  knob: { width: fs(KNOB), height: fs(KNOB), borderRadius: 999, backgroundColor: colors.paper50 },
  knobOff: { borderWidth: 1, borderColor: withOpacity(colors.ink900, 15) },
});
