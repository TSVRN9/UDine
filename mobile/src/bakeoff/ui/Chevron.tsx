import Svg, { Path } from "react-native-svg";
import { m2 } from "../../lib/theme";

// one path per direction, drawn once (M2 `.icon svg`, `.chev`, `.swbtn svg`)
const SHAPE = {
  back: { box: 24, d: "M15 5l-7 7 7 7" },
  forward: { box: 24, d: "M9 6l6 6-6 6" },
  down: { box: 18, d: "M4 7l5 5 5-5" },
} as const;

export function Chevron({ dir, size, stroke, width = m2.size.stroke }: { dir: keyof typeof SHAPE; size: number; stroke: string; width?: number }) {
  const s = SHAPE[dir];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${s.box} ${s.box}`} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"><Path d={s.d} /></Svg>
  );
}

/** The `>` at the right of a row. */
export const RowChevron = ({ size = m2.size.chevron }: { size?: number }) => <Chevron dir="forward" size={size} stroke={m2.color.slate} />;

/** The gold `v` on the station and day cells (M2 `.swbtn svg`, `.dayc svg`), and the quieter one by the status line. */
export const DownChevron = ({ stroke = m2.color.gold, size = m2.size.chevron, width = m2.size.strokeBold }: { stroke?: string; size?: number; width?: number }) => <Chevron dir="down" size={size} stroke={stroke} width={width} />;
