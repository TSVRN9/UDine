import { Image } from "react-native";

// Pre-rendered by scripts/bakeoff-glyphs.js from the paths the Svgs drew (96 px: scaled down, the stroke scales with the box, as a viewBox's does).
// Chevrons, + / - and the tick are white and tinted. An Svg is rasterised in software on the UI thread each time one mounts.
const GLYPH = {
  chevronBack: require("../../../assets/bakeoff/glyphs/chevron-back.png"),
  chevronForward: require("../../../assets/bakeoff/glyphs/chevron-forward.png"),
  chevronDown: require("../../../assets/bakeoff/glyphs/chevron-down.png"),
  chevronDownThin: require("../../../assets/bakeoff/glyphs/chevron-down-thin.png"),
  plus: require("../../../assets/bakeoff/glyphs/plus.png"),
  minus: require("../../../assets/bakeoff/glyphs/minus.png"),
  tick: require("../../../assets/bakeoff/glyphs/tick.png"),
  markPlant: require("../../../assets/bakeoff/glyphs/mark-plant.png"),
  markVeg: require("../../../assets/bakeoff/glyphs/mark-veg.png"),
  markHalal: require("../../../assets/bakeoff/glyphs/mark-halal.png"),
  markLocal: require("../../../assets/bakeoff/glyphs/mark-local.png"),
  markSus: require("../../../assets/bakeoff/glyphs/mark-sus.png"),
} as const;
export type GlyphName = keyof typeof GLYPH;

/** A drawn glyph: `size` square, `tint` for the white ones. */
export function Glyph({ name, size, tint }: { name: GlyphName; size: number; tint?: string }) {
  return <Image source={GLYPH[name]} fadeDuration={0} accessible={false} style={{ width: size, height: size, tintColor: tint }} />;
}
