import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { m2 } from "../../lib/theme";

type Variant = keyof typeof m2.type;
const NUM: Variant[] = ["brand", "hallTitle", "bandName", "pinName", "menuName", "section", "station", "stationHead", "day", "metaNum", "stepper", "letter", "tile", "schedHead"];
const weight: Partial<Record<Variant, string>> = {
  mealTab: m2.font.bodyMd, tabBar: m2.font.bodySb, rowName: m2.font.bodySb, button: m2.font.bodySb,
  metaNum: m2.font.num, hallTitle: m2.font.numSb, bandName: m2.font.numSb, pinName: m2.font.numSb,
  menuName: m2.font.numSb, brand: m2.font.numSb, section: m2.font.numSb, stationHead: m2.font.numSb,
  station: m2.font.numSb, day: m2.font.numSb, schedHead: m2.font.numSb, link: m2.font.bodySb, dayRow: m2.font.bodyMd, stepper: m2.font.numSb, letter: m2.font.numB, tile: m2.font.numSb,
};

export function Text({ v = "date", color = m2.color.ink, style, ...p }: TextProps & { v?: Variant; color?: string }) {
  const t = m2.type[v];
  const s: TextStyle = {
    fontFamily: weight[v] ?? m2.font.body,
    fontSize: t.size,
    lineHeight: t.line,
    color,
    ...(NUM.includes(v) ? { fontVariant: ["tabular-nums"] } : null),
    // Oswald's descenders reach below a line box of 1 x its size (M2's `line-height: 1`), and Android clips text to its view: the view
    // gets room below the text, and the same amount comes off its margin, so the glyphs and the layout stay where M2 has them
    ...(t.line < t.size * 1.2 ? { paddingBottom: Math.ceil(t.size * 0.3), marginBottom: -Math.ceil(t.size * 0.3) } : null),
  };
  return <RNText {...p} style={[s, style]} />;
}
