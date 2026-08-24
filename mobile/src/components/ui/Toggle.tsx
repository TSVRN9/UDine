import { Pressable, StyleSheet, View } from "react-native";
import { colors, fs, withOpacity } from "../../lib/theme";

// Toggle track/knob geometry, verbatim from the Privacy/ExportChecklist artboards' shared
// "Toggle (exact, used everywhere on this screen)" spec: 44x26 track, 22px knob, ON translateX(18).
// Routed through fs() per the issue's own instruction -- these are 390dp-reference control
// dimensions, same treatment as PlateBar's fs(48) LOG button height, not a second scaling
// mechanism. The artboard's own 180ms transitions aren't implemented: no other screen in this app
// implements any of its artboard's "Motion (from Prototype)" notes either (see hallMenu's pill
// steppers/checkboxes) -- state changes instantly everywhere else, so this stays consistent with
// that rather than being the one animated control.
const TRACK_W = 44;
const TRACK_H = 26;
const KNOB = 22;
const KNOB_TRAVEL = 18;

interface Props {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}

/** Custom track+knob toggle -- RN's native `Switch` can't be pinned to the artboard's exact
 * 44x26/22px geometry across platforms, so this is a plain styled View instead (no new
 * dependency: react-native-svg isn't in this project, per login.tsx/halls/[slug].tsx's own
 * precedent of avoiding it for decorative chrome). */
export function Toggle({ value, onValueChange, disabled }: Props) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={8}
    >
      <View style={[styles.track, { backgroundColor: value ? colors.maroon600 : withOpacity(colors.ink900, 15) }]}>
        <View style={[styles.knob, !value && styles.knobOff, value && { transform: [{ translateX: fs(KNOB_TRAVEL) }] }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: fs(TRACK_W), height: fs(TRACK_H), borderRadius: 999, padding: fs(2), justifyContent: "center" },
  knob: { width: fs(KNOB), height: fs(KNOB), borderRadius: 999, backgroundColor: colors.paper50 },
  knobOff: { borderWidth: 1, borderColor: withOpacity(colors.ink900, 15) },
});
