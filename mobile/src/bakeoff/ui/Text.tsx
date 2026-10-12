import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from "react-native";
import { m2 } from "../../lib/theme";

type Variant = keyof typeof m2.type;
const NUM: Variant[] = ["brand", "hallTitle", "bandName", "pinName", "menuName", "section", "station", "stationHead", "day", "metaNum", "stepper", "letter", "tile", "schedHead", "dishName", "price", "mark", "sheetHead", "sheetHeadSm", "chip", "labelTitle", "calNum", "dv", "scaleNum", "barNum", "factNum", "mealCal"];
const weight: Partial<Record<Variant, string>> = {
  mealTab: m2.font.bodyMd, tabBar: m2.font.bodySb, rowName: m2.font.bodySb, button: m2.font.bodySb,
  metaNum: m2.font.num, hallTitle: m2.font.numSb, bandName: m2.font.numSb, pinName: m2.font.numSb,
  menuName: m2.font.numSb, brand: m2.font.numSb, section: m2.font.numSb, stationHead: m2.font.numSb,
  station: m2.font.numSb, day: m2.font.numSb, schedHead: m2.font.numSb, link: m2.font.bodySb, dayRow: m2.font.bodyMd, stepper: m2.font.numSb, letter: m2.font.numB, tile: m2.font.numSb,
  dishName: m2.font.numSb, price: m2.font.numSb, mark: m2.font.numSb, sheetHead: m2.font.numSb, sheetHeadSm: m2.font.numSb, chip: m2.font.numSb,
  action: m2.font.bodySb, labelTitle: m2.font.numB, calNum: m2.font.numB, dv: m2.font.numSb, scaleNum: m2.font.num,
  barNum: m2.font.numSb, factRow: m2.font.bodySb, factNum: m2.font.numSb, mealCal: m2.font.numSb,
};

export function Text({ v = "date", color = m2.color.ink, style, ...p }: TextProps & { v?: Variant; color?: string }) {
  const t = m2.type[v];
  const s: TextStyle = {
    fontFamily: weight[v] ?? m2.font.body,
    fontSize: t.size,
    lineHeight: t.line,
    color,
    ...(NUM.includes(v) ? { fontVariant: ["tabular-nums"] } : null),
  };
  // Oswald's descenders reach below a line box of 1 x its size (M2's `line-height: 1`), and Android clips text to its view: the view
  // gets room below the text, and the same amount comes off its bottom margin, so the glyphs and the layout stay where M2 has them.
  // The caller's own bottom margin is what the layout should be, so the room comes off that, not off a margin it replaced.
  if (t.line < t.size * 1.2) {
    const room = Math.ceil(t.size * 0.3), own = StyleSheet.flatten(style) as TextStyle | undefined;
    const base = (typeof own?.marginBottom === "number" ? own.marginBottom : typeof own?.marginVertical === "number" ? own.marginVertical : typeof own?.margin === "number" ? own.margin : 0);
    const pad = typeof own?.paddingBottom === "number" ? own.paddingBottom : typeof own?.paddingVertical === "number" ? own.paddingVertical : typeof own?.padding === "number" ? own.padding : 0;
    return <RNText {...p} style={[s, style, { paddingBottom: pad + room, marginBottom: base - room }]} />;
  }
  return <RNText {...p} style={[s, style]} />;
}
