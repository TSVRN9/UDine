import { useEffect, type ReactNode } from "react";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import { DownChevron } from "./Chevron";
import type { Labels } from "./labels";
import { timed } from "./motion";
import { Press } from "./Press";
import { Text } from "./Text";

export function StationButton({ s }: { s: NonNullable<Labels["station"]> }) {
  return (
    <Press feedback="tint" tint="onDm" accessibilityRole="button" accessibilityLabel={`${s.label}, stations`} accessibilityState={{ expanded: !!s.open }} onPress={s.onPress}
      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: m2.space.gutter }}>
      <Text v="station" color={m2.color.gold} numberOfLines={1} style={{ flexShrink: 1 }}>{s.label}</Text>
      <Flip open={!!s.open}><DownChevron /></Flip>
    </Press>
  );
}

/** M2 `.swbtn[aria-expanded=true] svg`: the chevron turns over on the container's own timing. */
export function Flip({ open, children }: { open: boolean; children: ReactNode }) {
  const r = useSharedValue(0);
  useEffect(() => { r.set(timed(open ? 1 : 0, m2Motion.cont)); }, [open, r]);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get() * 180}deg` }] }));
  return <Animated.View style={s}>{children}</Animated.View>;
}
