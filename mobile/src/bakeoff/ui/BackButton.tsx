import { m2 } from "../../lib/theme";
import { Chevron } from "./Chevron";
import { Press } from "./Press";

/** M2 `.icon`: a 48 dp target around a white back chevron, on a maroon bar or over a photo. */
export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} style={{ width: m2.size.icon, height: m2.size.icon, alignItems: "center", justifyContent: "center" }}>
      <Chevron dir="back" size={m2.size.backIcon} stroke={m2.color.white} />
    </Press>
  );
}
