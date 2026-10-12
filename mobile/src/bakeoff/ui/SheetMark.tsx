import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { m2 } from "../../lib/theme";
import { Text } from "./Text";

export type MarkKind = "plant" | "veg" | "halal" | "local" | "sus";
const LABEL: Record<MarkKind, string> = { plant: "Plant based", veg: "Vegetarian", halal: "Halal", local: "Local", sus: "Sustainable" };
const ink = m2.color.dm;

// M2's GL glyphs (16 x 16)
const Glyph = ({ kind }: { kind: MarkKind }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16">
    {kind === "plant" ? (
      <>
        <Path d="M8 15.2V8" stroke={ink} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Path d="M7.6 9.6C7.6 5.6 5.4 3.4 1 3.4 1 7.6 3.4 9.6 7.6 9.6Z M8.4 8.2C8.4 4.2 10.8 1.4 15 1.4 15 5.6 12.6 8.2 8.4 8.2Z" fill={ink} />
      </>
    ) : kind === "veg" ? (
      <>
        <Path d="M3 13C3 6 7 3 13.5 2.5 13.5 9 10 13 3 13Z" fill={ink} />
        <Path d="M3 13 9 7" stroke={m2.color.white} strokeWidth={1.2} fill="none" />
      </>
    ) : kind === "halal" ? (
      <>
        <Circle cx={8} cy={8} r={6} fill="none" stroke={ink} strokeWidth={1.5} />
        <Path d="M5.5 5v6M10.5 5v6M5.5 8h5" stroke={ink} strokeWidth={1.5} />
      </>
    ) : kind === "local" ? (
      <>
        <Path d="M8 14.5S3 9.6 3 6.5a5 5 0 0 1 10 0c0 3.1-5 8-5 8Z" fill="none" stroke={ink} strokeWidth={1.5} />
        <Circle cx={8} cy={6.5} r={1.6} fill={ink} />
      </>
    ) : (
      <Path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" fill="none" stroke={ink} strokeWidth={1.5} />
    )}
  </Svg>
);

/** M2 `.mk`: the dish sheet's patch, 30 high: gold felt, maroon dashed stitching, glyph and label. */
export function SheetMark({ kind }: { kind: MarkKind }) {
  return (
    <View accessible accessibilityLabel={LABEL[kind]}
      style={{ height: 30, paddingLeft: 10, paddingRight: 12, borderRadius: 5, backgroundColor: m2.color.gold, flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View pointerEvents="none" style={{ position: "absolute", top: 3, left: 3, right: 3, bottom: 3, borderRadius: 3, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(59,10,15,0.75)" }} />
      <Glyph kind={kind} />
      <Text v="mark" color={m2.color.dm}>{LABEL[kind]}</Text>
    </View>
  );
}
