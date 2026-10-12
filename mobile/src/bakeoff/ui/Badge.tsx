import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { m2 } from "../../lib/theme";

/** Diet patch: gold felt, maroon dashed stitching, maroon glyph (children). */
export function Badge({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}
      style={{ width: 20, height: 20, borderRadius: m2.radius.patch, backgroundColor: m2.color.gold, alignItems: "center", justifyContent: "center" }}>
      <View pointerEvents="none" style={{ position: "absolute", top: 2, left: 2, right: 2, bottom: 2, borderRadius: 2, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(59,10,15,0.75)" }} />
      {children}
    </View>
  );
}

// M2's GL.plant (a sprout) and GL.veg (a leaf): the only marks drawn inline on rows
const Plant = () => (
  <Svg width={12} height={12} viewBox="0 0 16 16">
    <Path d="M8 15.2V8" stroke={m2.color.dm} strokeWidth={2} fill="none" strokeLinecap="round" />
    <Path d="M7.6 9.6C7.6 5.6 5.4 3.4 1 3.4 1 7.6 3.4 9.6 7.6 9.6Z M8.4 8.2C8.4 4.2 10.8 1.4 15 1.4 15 5.6 12.6 8.2 8.4 8.2Z" fill={m2.color.dm} />
  </Svg>
);
const Veg = () => (
  <Svg width={12} height={12} viewBox="0 0 16 16">
    <Path d="M3 13C3 6 7 3 13.5 2.5 13.5 9 10 13 3 13Z" fill={m2.color.dm} />
    <Path d="M3 13 9 7" stroke={m2.color.white} strokeWidth={1.2} fill="none" />
  </Svg>
);

/** The patch a row wears: a sprout for plant based, a leaf for vegetarian, nothing otherwise. `diet` is `Dish.diet`'s bit set. */
export function DietBadge({ diet }: { diet: number }) {
  if (diet & 2) return <Badge label="Plant based"><Plant /></Badge>;
  if (diet & 1) return <Badge label="Vegetarian"><Veg /></Badge>;
  return null;
}
