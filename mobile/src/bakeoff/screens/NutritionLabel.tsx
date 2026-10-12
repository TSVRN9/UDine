import { useRef } from "react";
import { View, type ViewStyle } from "react-native";
import { m2 } from "../../lib/theme";
import { Text } from "../ui";
import type { Label, LabelRow } from "../logic/dishSheet";

const rule = (w: number): ViewStyle => ({ borderBottomWidth: w, borderBottomColor: m2.color.dm });
const { heavy, calRule } = m2.size;
const bold = { fontFamily: m2.font.bodySb } as const;

function Row({ r }: { r: LabelRow }) {
  if (r.kind === "thin") {
    return (
      <View style={[rule(1), { flexDirection: "row", justifyContent: "space-between", paddingTop: m2.space.nrBottom, paddingBottom: m2.space.line }]}>
        <Text v="lblThin" color={m2.color.dm} style={bold}>{r.left}</Text>
        <Text v="lblThin" color={m2.color.dm} style={bold}>{r.right}</Text>
      </View>
    );
  }
  const top = r.kind === "row";
  return (
    <View style={[rule(r.last ? heavy : 1), { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: m2.space.panel, paddingTop: m2.space.nrBottom, paddingBottom: m2.space.line, paddingLeft: top ? 0 : m2.space.action }]}>
      <Text v="lbl" color={m2.color.dm} style={{ flexShrink: 1 }}>
        {top ? <Text v="lbl" color={m2.color.dm} style={bold}>{r.name}</Text> : r.name.startsWith("Trans") ? <><Text v="lbl" color={m2.color.dm} style={{ fontStyle: "italic" }}>Trans</Text>{r.name.slice(5)}</> : r.name}
        {` ${r.value}`}
      </Text>
      <Text v="dv" color={m2.color.dm} style={{ minWidth: m2.size.dvMin, textAlign: "right" }}>{r.right}</Text>
    </View>
  );
}

/**
 * M2 `labelHTML`: the FDA Nutrition Facts panel in the plate-totals treatment (white, 2 dp maroon frame, heavy rules). `onCalBottom`
 * reports where the rule under Calories ends, in the label's parent's coordinates: the dish sheet rests there.
 */
export function NutritionLabel({ label, onCalBottom }: { label: Label; onCalBottom?: (y: number) => void }) {
  const at = useRef<{ label?: number; cal?: { y: number; h: number } }>({});
  const report = () => { const { label: y, cal } = at.current; if (y != null && cal) onCalBottom?.(y + cal.y + cal.h); };
  return (
    <View onLayout={(e) => { at.current.label = e.nativeEvent.layout.y; report(); }}
      style={{ marginTop: m2.space.group, borderWidth: m2.size.frame, borderColor: m2.color.dm, paddingTop: m2.space.line, paddingHorizontal: m2.space.panel, paddingBottom: m2.space.factsBottom, backgroundColor: m2.color.white }}>
      <View style={[rule(1), { paddingTop: m2.space.calTop, paddingBottom: m2.space.line }]}>
        <Text v="labelTitle" color={m2.color.dm}>Nutrition Facts</Text>
      </View>
      {label.serving ? (
        <View style={[rule(heavy), { flexDirection: "row", justifyContent: "space-between", gap: m2.space.panel, paddingVertical: m2.space.lsPad }]}>
          <Text v="lbl" color={m2.color.dm} style={bold}>Serving size</Text>
          <Text v="lbl" color={m2.color.dm} style={[bold, { flexShrink: 1, textAlign: "right" }]}>{label.serving}</Text>
        </View>
      ) : null}
      <View onLayout={(e) => { at.current.cal = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height }; report(); }}
        style={[rule(calRule), { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: m2.space.calTop, paddingBottom: m2.space.line }]}>
        <Text v="lblLg" color={m2.color.dm} style={bold}>Calories</Text>
        <Text v="calNum" color={m2.color.dm}>{label.cal}</Text>
      </View>
      {label.rows.map((r, i) => <Row key={i} r={r} />)}
      <Text v="lblFoot" color={m2.color.ink} style={{ paddingTop: m2.space.lsPad, paddingBottom: m2.space.lfBottom }}>*Percent Daily Values are based on a 2,000 calorie diet.</Text>
    </View>
  );
}
