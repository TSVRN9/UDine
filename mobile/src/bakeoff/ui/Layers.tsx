import type { ReactNode } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";

type AStyle = React.ComponentProps<typeof Animated.View>["style"];

const abs = { position: "absolute", top: 0, left: 0, right: 0 } as const;
/** The day's labels exist twice, `now` and `was`, stacked: a day change commits the new ones while the old stay on screen, and the
 * switch is two opacities on the UI thread, with no commit between them. `was` never takes touches. */
export function Layers({ now, was, newStyle, oldStyle, fillParent }: { now: ReactNode; was: ReactNode; newStyle?: AStyle; oldStyle?: AStyle; fillParent?: boolean }) {
  return (
    <View style={fillParent ? { flex: 1 } : undefined}>
      <Animated.View style={[fillParent ? { flex: 1 } : null, newStyle]}>{now}</Animated.View>
      <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[fillParent ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } : abs, oldStyle]}>{was}</Animated.View>
    </View>
  );
}