import type { ReactNode } from "react";
import { m2 } from "../../lib/theme";
import { Felt } from "./Felt";
import { Glyph } from "./Glyph";

/** Diet patch: gold felt, maroon dashed stitching, maroon glyph (children). */
export function Badge({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Felt kind="patch" accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: m2.size.patch, height: m2.size.patch, alignItems: "center", justifyContent: "center" }}>
      {children}
    </Felt>
  );
}

// M2's GL.plant (a sprout) and GL.veg (a leaf): the only marks drawn inline on rows
const Plant = () => <Glyph name="markPlant" size={m2.size.rowGlyph} />;
const Veg = () => <Glyph name="markVeg" size={m2.size.rowGlyph} />;

/** The patch a row wears: a sprout for plant based, a leaf for vegetarian, nothing otherwise. `diet` is `Dish.diet`'s bit set. */
export function DietBadge({ diet }: { diet: number }) {
  if (diet & 2) return <Badge label="Plant based"><Plant /></Badge>;
  if (diet & 1) return <Badge label="Vegetarian"><Veg /></Badge>;
  return null;
}
