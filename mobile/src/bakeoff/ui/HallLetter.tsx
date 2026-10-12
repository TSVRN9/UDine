import Svg, { Text as SvgText } from "react-native-svg";
import { m2 } from "../../lib/theme";

/** The band's chenille varsity letter: felt (white, stroked) under a gold fill with a dashed maroon stitch.
 * The box is right-aligned to its parent; `x` is the text's start x inside it (M2's `LX`, see logic/letters.ts), so the
 * letter keeps its distance from the right edge at any width. The caller holds the positions. */
export function HallLetter({ letter, x, top = -6, size = 200 }: { letter: string; x: number; top?: number; size?: number }) {
  const font = { fontFamily: m2.font.numB, fontSize: 210 * (size / 200) };
  return (
    <Svg width={size} height={size} style={{ position: "absolute", right: 0, top }} pointerEvents="none">
      <SvgText x={x} y={size * 0.93} fill={m2.color.white} stroke={m2.color.white} strokeWidth={12} strokeLinejoin="round" {...font}>{letter}</SvgText>
      <SvgText x={x} y={size * 0.93} fill={m2.color.gold} stroke={m2.color.dm} strokeWidth={1.5} strokeDasharray="5 4" {...font}>{letter}</SvgText>
    </Svg>
  );
}
