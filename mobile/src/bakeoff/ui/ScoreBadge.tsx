import Svg, { G, Path, Rect, Text as SvgText } from "react-native-svg";
import { m2 } from "../../lib/theme";

export type Carbon = "A" | "B" | "C" | "D" | "E";
const CREDGE = new Set(["B", "C", "D"]);
// M2's FOOT / HEART pictograms, 24x30 tile
const FOOT = "M15.6 2.3a2 2 0 1 1 0 4a2 2 0 0 1 0-4ZM11.3 1.9a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3ZM7.6 3.15a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 0 1 0-2.5ZM4.2 12.4C4.2 8.9 7.6 7.4 12 7.4s7.8 1.5 7.8 5c0 3-1.4 4.6-1.4 8 0 4.4-2.6 7.4-6.4 7.4s-6.4-3-6.4-7.4c0-3.4-1.8-5-1.8-8Z";
const HEART = "M12 27.6C5.9 23.2 1.8 19.4 1.8 12.9 1.8 8.7 4.7 5.6 8.4 5.6c1.6 0 2.9.7 3.6 2 .7-1.3 2-2 3.6-2 3.7 0 6.6 3.1 6.6 7.3 0 6.5-4.1 10.3-10.2 14.7Z";

/** M2's score tile: portrait rounded tile, white pictogram, the value knocked into it. Renders nothing for
 * an unscored dish (a healthfulness 0 is a real score). */
export function ScoreBadge({ kind, value, size }: {
  kind: "health" | "carbon";
  value: number | Carbon | null;
  size: "row" | "sheet";
}) {
  if (value == null) return null;
  const carbon = kind === "carbon";
  const [bg, ink] = carbon ? m2.color.carbon[value as Carbon] : [m2.color.health[value as number], m2.color.healthInk];
  const edge = carbon ? CREDGE.has(value as string) : (value as number) < 4;
  const [w, h] = size === "row" ? m2.size.tile : m2.size.tileSheet;
  return (
    <Svg
      width={w}
      height={h}
      viewBox="0 0 24 30"
      accessible
      accessibilityRole="image"
      accessibilityLabel={carbon ? `Carbon rating ${value}` : `Healthfulness ${value} of 7`}
    >
      <Rect x={0.5} y={0.5} width={23} height={29} rx={4.5} fill={bg} stroke={edge ? ink : undefined} strokeOpacity={edge ? 0.55 : undefined} />
      <G fill={m2.color.white}><Path d={carbon ? FOOT : HEART} /></G>
      <SvgText x={12} y={carbon ? 22.9 : 20.6} textAnchor="middle" fill={ink} fontFamily={m2.font.numSb} fontSize={m2.type.tile.size}>
        {String(value)}
      </SvgText>
    </Svg>
  );
}
