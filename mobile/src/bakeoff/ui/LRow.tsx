import type { ReactNode } from "react";
import { View, type AccessibilityRole, type AccessibilityState } from "react-native";
import { m2 } from "../../lib/theme";
import { HairRow } from "./HairRow";
import { Text } from "./Text";

/** The quiet line under an `LRow`'s title (M2 `.lrow .b`). */
export const LRowSub = ({ children }: { children: string }) => (
  <Text v="meta" color={m2.color.slate} numberOfLines={1} style={{ marginTop: m2.space.lrowSub }}>{children}</Text>
);

/**
 * M2 `.lrow` (and `.check`): a 56 dp row with a title, a quieter line under it, something leading and something trailing, a hairline under it
 * unless it is the `last`. A row with `onPress` is a button that tints under the finger; without, it is plain.
 */
export function LRow({ title, sub, lead, trailing, onPress, last, accessibilityRole, accessibilityLabel, accessibilityState }: {
  title: string; sub?: ReactNode; lead?: ReactNode; trailing?: ReactNode; onPress?: () => void; last?: boolean;
  accessibilityRole?: AccessibilityRole; accessibilityLabel?: string; accessibilityState?: AccessibilityState;
}) {
  const box = { minHeight: m2.size.lrow, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: m2.space.panel, paddingVertical: m2.space.part } as const;
  const left = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: m2.space.panel, flex: 1, minWidth: 0 }}>
      {lead}
      <View style={{ flexShrink: 1 }}>
        <Text v="rowName" color={m2.color.ink}>{title}</Text>
        {sub}
      </View>
    </View>
  );
  return (
    <HairRow onPress={onPress} last={last} style={box} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState}>{left}{trailing}</HairRow>
  );
}
