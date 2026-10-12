import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { m2 } from "../../lib/theme";
import { Text } from "./Text";

/** M2's `.meter`: five 5x12 lamps, lit ones gold, on a hall band or header. */
export function Meter({ lit }: { lit: number }) {
  return (
    <View accessible={false} style={{ flexDirection: "row", gap: 2, alignItems: "flex-end" }}>
      {[0, 1, 2, 3, 4].map((i) => <View key={i} style={{ width: 5, height: 12, borderRadius: 1, backgroundColor: i < lit ? m2.color.gold : "rgba(255,255,255,0.22)" }} />)}
    </View>
  );
}

/** M2's `.bz`: the meter and the word; in the header `extra` ("Calmer around 1:30 PM") is a second line. */
export function BusyRow({ lamps, word, extra, header }: { lamps: number; word: string; extra?: string; header?: boolean }) {
  return (
    <View style={{ marginTop: header ? 8 : 6, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 5, maxWidth: header ? 230 : undefined }}>
      <Meter lit={lamps} />
      <Text v="statusSm" color={m2.color.white}>{word}</Text>
      {header && extra ? <Text v="statusSm" color={m2.color.onDmSoft} style={{ flexBasis: "100%" }}>{extra}</Text> : null}
    </View>
  );
}

const W = 350, H = 30, GAP = 3, LG = 2, LH = (H - LG * 4) / 5;
/** M2's `histSVG`: one column of five lamps per hour, lit like the band meter; the current hour is gold. */
export function Board({ columns }: { columns: { lit: number; now: boolean }[] }) {
  const n = columns.length, bw = (W - GAP * (n - 1)) / n;
  return (
    <View accessible={false} style={{ position: "absolute", left: m2.space.gutter, right: m2.space.gutter, bottom: 10, height: H }} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {columns.map((c, i) => [0, 1, 2, 3, 4].map((k) => (
          <Rect key={`${i}-${k}`} x={i * (bw + GAP)} y={H - (k + 1) * LH - k * LG} width={bw} height={LH} rx={0.6}
            fill={k >= c.lit ? "rgba(255,255,255,0.12)" : c.now ? m2.color.gold : "rgba(255,255,255,0.55)"} />
        )))}
      </Svg>
    </View>
  );
}
