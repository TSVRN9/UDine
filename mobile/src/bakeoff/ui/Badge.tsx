import type { ReactNode } from "react";
import { View } from "react-native";
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
