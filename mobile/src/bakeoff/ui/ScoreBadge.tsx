import { Image } from "react-native";
import { m2 } from "../../lib/theme";

export type Carbon = "A" | "B" | "C" | "D" | "E";

// M2's score tile (a portrait rounded tile, a white pictogram, the value knocked into it), pre-rendered by scripts/bakeoff-glyphs.js in the ramp colour
// and Oswald 600 figure the SVG had: an Svg per tile cost a software raster on every row that mounted
const HEALTH = [
  require("../../../assets/bakeoff/glyphs/score-health-0.png"), require("../../../assets/bakeoff/glyphs/score-health-1.png"),
  require("../../../assets/bakeoff/glyphs/score-health-2.png"), require("../../../assets/bakeoff/glyphs/score-health-3.png"),
  require("../../../assets/bakeoff/glyphs/score-health-4.png"), require("../../../assets/bakeoff/glyphs/score-health-5.png"),
  require("../../../assets/bakeoff/glyphs/score-health-6.png"), require("../../../assets/bakeoff/glyphs/score-health-7.png"),
];
const CARBON: Record<Carbon, number> = {
  A: require("../../../assets/bakeoff/glyphs/score-carbon-A.png"), B: require("../../../assets/bakeoff/glyphs/score-carbon-B.png"),
  C: require("../../../assets/bakeoff/glyphs/score-carbon-C.png"), D: require("../../../assets/bakeoff/glyphs/score-carbon-D.png"),
  E: require("../../../assets/bakeoff/glyphs/score-carbon-E.png"),
};

/** M2's score tile. Renders nothing for an unscored dish (a healthfulness 0 is a real score). */
export function ScoreBadge({ kind, value, size }: {
  kind: "health" | "carbon";
  value: number | Carbon | null;
  size: "row" | "sheet" | "scale";
}) {
  if (value == null) return null;
  const carbon = kind === "carbon";
  const [w, h] = size === "row" ? m2.size.tile : size === "sheet" ? m2.size.tileSheet : m2.size.tileScale;
  return (
    <Image
      source={carbon ? CARBON[value as Carbon] : HEALTH[value as number]}
      fadeDuration={0}
      accessible
      accessibilityRole="image"
      accessibilityLabel={carbon ? `Carbon rating ${value}` : `Healthfulness ${value} of 7`}
      style={{ width: w, height: h }}
    />
  );
}
