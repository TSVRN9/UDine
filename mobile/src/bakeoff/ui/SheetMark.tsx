import { m2 } from "../../lib/theme";
import { Felt } from "./Felt";
import { Glyph } from "./Glyph";
import { Text } from "./Text";

export type MarkKind = "plant" | "veg" | "halal" | "local" | "sus";
const LABEL: Record<MarkKind, string> = { plant: "Plant based", veg: "Vegetarian", halal: "Halal", local: "Local", sus: "Sustainable" };
const GLYPH = { plant: "markPlant", veg: "markVeg", halal: "markHalal", local: "markLocal", sus: "markSus" } as const;

/** M2 `.mk`: the dish sheet's patch, 30 high: gold felt, maroon dashed stitching, glyph and label. */
export function SheetMark({ kind }: { kind: MarkKind }) {
  return (
    <Felt kind="mark" accessible accessibilityLabel={LABEL[kind]}
      style={{ height: m2.size.mark, paddingLeft: m2.space.markStart, paddingRight: m2.space.panel, flexDirection: "row", alignItems: "center", gap: m2.space.markGap }}>
      <Glyph name={GLYPH[kind]} size={m2.size.markGlyph} />
      <Text v="mark" color={m2.color.dm}>{LABEL[kind]}</Text>
    </Felt>
  );
}
