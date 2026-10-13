import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { Text } from "./Text";

/**
 * A tab's maroon head (M2 `.hhead`, `.yhead`): a 30 dp line of date (with the brand at its left when there is one), then the screen's big
 * title. `you` is `.yhead`, 2 dp roomier under the title. `children` (a network note) lie over the head.
 */
export function ScreenHeader({ date, title, brand, variant = "halls", children }: { date: string; title: string; brand?: string; variant?: "halls" | "you"; children?: ReactNode }) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: m2.color.dm, paddingTop: top + m2.space.headTop, paddingHorizontal: m2.space.gutter, paddingBottom: variant === "you" ? m2.space.yheadBottom : m2.space.action }}>
      {brand ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", height: m2.size.titleRow }}>
          <Text v="brand" color={m2.color.gold}>{brand}</Text>
          <Text v="headDate" color={m2.color.onDm}>{date}</Text>
        </View>
      ) : (
        <View style={{ height: m2.size.titleRow, justifyContent: "flex-end" }}><Text v="headDate" color={m2.color.onDm}>{date}</Text></View>
      )}
      <Text v="hallTitle" color={m2.color.white} accessibilityRole="header" style={{ marginTop: m2.space.titleTop, top: m2.space.titleInk }}>{title}</Text>
      {children}
    </View>
  );
}
