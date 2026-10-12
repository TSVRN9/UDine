import type { ComponentProps } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";

/**
 * What M2's rows share: a 1 dp hairline under them (none under the `last`), and a tint under the finger when they open something. `LRow` (`.lrow`,
 * `.check`), the diet note (`.dietnote`), a plate row (`.prow`), the holiday's note (`.evrow`) and a logged meal (`.meal`) each give it their own box.
 * With `onPress` it is a button; without, plain.
 */
export function HairRow({ onPress, last, style, children, ...a11y }: { onPress?: () => void; last?: boolean; style?: StyleProp<ViewStyle> } & Omit<ComponentProps<typeof View>, "style">) {
  const box = [{ borderBottomWidth: last ? 0 : 1, borderBottomColor: m2.color.hair }, style];
  return onPress ? (
    <Press feedback="tint" {...a11y} accessibilityRole={a11y.accessibilityRole ?? "button"} onPress={onPress} style={box}>{children}</Press>
  ) : (
    <View {...a11y} style={box}>{children}</View>
  );
}
