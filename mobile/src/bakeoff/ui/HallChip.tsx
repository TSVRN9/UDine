import { m2 } from "../../lib/theme";
import { Felt } from "./Felt";
import { Press } from "./Press";
import { Text } from "./Text";

/**
 * M2 `.hchip`: one place that serves the dish, a 44 high deep-maroon tag. A hall wears its varsity letter (gold felt, stitched)
 * before its name; a café has no letter, so its name sits on the tag alone.
 */
export function HallChip({ name, letter, onPress }: { name: string; letter?: string; onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={name} onPress={onPress}
      style={{ height: 44, paddingLeft: letter ? 8 : 16, paddingRight: 16, borderRadius: m2.radius.button, backgroundColor: m2.color.dm, flexDirection: "row", alignItems: "center", gap: 10 }}>
      {letter ? (
        <Felt kind="patch" style={{ width: m2.size.letterPatch, height: m2.size.letterPatch, alignItems: "center", justifyContent: "center" }}>
          <Text v="letter" color={m2.color.dm}>{letter}</Text>
        </Felt>
      ) : null}
      <Text v="chip" color={m2.color.white}>{name}</Text>
    </Press>
  );
}
