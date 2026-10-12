import { memo } from "react";
import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { Text } from "./Text";

/** M2's `.meter`: five 5x12 lamps, lit ones gold, on a hall band or header. */
export function Meter({ lit }: { lit: number }) {
  return (
    <View accessible={false} style={{ flexDirection: "row", gap: m2.space.lampGap, alignItems: "flex-end" }}>
      {[0, 1, 2, 3, 4].map((i) => <View key={i} style={{ width: m2.size.lampW, height: m2.size.lampH, borderRadius: 1, backgroundColor: i < lit ? m2.color.gold : m2.color.lampOff }} />)}
    </View>
  );
}

/** M2's `.bz`: the meter and the word; in the header `extra` ("Calmer around 1:30 PM") is a second line. */
export function BusyRow({ lamps, word, extra, header }: { lamps: number; word: string; extra?: string; header?: boolean }) {
  return (
    <View style={{ marginTop: header ? m2.space.part : m2.space.bzTop, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: m2.space.part, rowGap: m2.space.bzRow, maxWidth: header ? m2.size.bzMax : undefined }}>
      <Meter lit={lamps} />
      <Text v="statusSm" color={m2.color.white}>{word}</Text>
      {header && extra ? <Text v="statusSm" color={m2.color.onDmSoft} style={{ flexBasis: "100%" }}>{extra}</Text> : null}
    </View>
  );
}

const W = 350, H = 30, GAP = 3, LG = 2, LH = (H - LG * 4) / 5;
/** Where each lamp of M2's `histSVG` sits in its 350 x 30 box: column `i` of `n`, lamp `k` up from the foot. */
export function lampRects(n: number) {
  const bw = (W - GAP * (n - 1)) / n;
  return Array.from({ length: n * 5 }, (_, j) => {
    const i = Math.floor(j / 5), k = j % 5;
    return { i, k, x: i * (bw + GAP), y: H - (k + 1) * LH - k * LG, w: bw, h: LH };
  });
}
const pct = (v: number) => `${(v / W) * 100}%` as const;

/**
 * M2's `histSVG`: one column of five lamps per hour, lit like the band meter; the current hour is gold. Plain Views, positioned in percent of the box's
 * width (an Svg is rasterised in software on the UI thread on every draw, and this one has 85 rects).
 */
export const Board = memo(function Board({ columns }: { columns: { lit: number; now: boolean }[] }) {
  return (
    <View accessible={false} style={{ position: "absolute", left: m2.space.gutter, right: m2.space.gutter, bottom: m2.space.histBottom, height: H }} pointerEvents="none">
      {lampRects(columns.length).map(({ i, k, x, y, w, h }) => (
        <View key={`${i}-${k}`} style={{ position: "absolute", left: pct(x), top: y, width: pct(w), height: h, borderRadius: 1, backgroundColor: k >= columns[i].lit ? m2.color.boardOff : columns[i].now ? m2.color.gold : m2.color.boardOn }} />
      ))}
    </View>
  );
});
