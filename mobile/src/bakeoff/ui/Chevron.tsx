import { m2 } from "../../lib/theme";
import { Glyph, type GlyphName } from "./Glyph";

/** M2's chevrons (`.icon svg`, `.chev`, `.swbtn svg`): the back arrow, the row's `>`, and the down `v` (2.4 in its 18 box, 2 beside the status line). */
export function Chevron({ dir, size, stroke, width = m2.size.stroke }: { dir: "back" | "forward" | "down"; size: number; stroke: string; width?: number }) {
  const name: GlyphName = dir === "back" ? "chevronBack" : dir === "forward" ? "chevronForward" : width === m2.size.chevronStroke ? "chevronDownThin" : "chevronDown";
  return <Glyph name={name} size={size} tint={stroke} />;
}

/** The `>` at the right of a row. */
export const RowChevron = ({ size = m2.size.chevron }: { size?: number }) => <Chevron dir="forward" size={size} stroke={m2.color.slate} />;

/** The gold `v` on the station and day cells (M2 `.swbtn svg`, `.dayc svg`), and the quieter one by the status line. */
export const DownChevron = ({ stroke = m2.color.gold, size = m2.size.chevron, width = m2.size.strokeBold }: { stroke?: string; size?: number; width?: number }) => <Chevron dir="down" size={size} stroke={stroke} width={width} />;
