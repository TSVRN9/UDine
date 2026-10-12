import Svg, { Text as SvgText } from "react-native-svg";
import { m2 } from "../../lib/theme";

/** The band's chenille varsity letter: felt (white, stroked) under a gold fill with a dashed maroon stitch.
 * `x` is required and positioned by the caller; M2 revises the letter positions, so the kit holds none. */
export function HallLetter({ letter, x, top = -6, size = 200 }: { letter: string; x: number; top?: number; size?: number }) {
  const font = { fontFamily: m2.font.numB, fontSize: 210 * (size / 200) };
  return (
    <Svg width={size} height={size} style={{ position: "absolute", right: 0, top, transform: [{ translateX: x }] }} pointerEvents="none">
      <SvgText x={size / 2} y={size * 0.82} textAnchor="middle" fill={m2.color.white} stroke={m2.color.white} strokeWidth={12} strokeLinejoin="round" {...font}>{letter}</SvgText>
      <SvgText x={size / 2} y={size * 0.82} textAnchor="middle" fill={m2.color.gold} stroke={m2.color.dm} strokeWidth={1.5} strokeDasharray="5 4" {...font}>{letter}</SvgText>
    </Svg>
  );
}
