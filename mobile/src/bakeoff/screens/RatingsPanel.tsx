import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { ScoreBadge, Text } from "../ui";
import { CARBON_BAND } from "../logic/dishSheet";
import type { Carbon } from "../logic/types";

const bold = { fontFamily: m2.font.bodySb } as const;
const HEALTH = [0, 1, 2, 3, 4, 5, 6, 7];
const CARBONS: Carbon[] = ["A", "B", "C", "D", "E"];

/** M2 `scaleHTML`: the whole scale, each step a figure over its colour, the dish's own step the full tile. */
function Scale({ kind, value, label }: { kind: "health" | "carbon"; value: number | Carbon; label: string }) {
  const steps: (number | Carbon)[] = kind === "health" ? HEALTH : CARBONS;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
      {steps.map((x) =>
        x === value ? (
          <View key={x} style={{ paddingHorizontal: 2 }}><ScoreBadge kind={kind} value={x} size="scale" /></View>
        ) : (
          <View key={x} style={{ width: kind === "health" ? 14 : 17, paddingBottom: 7, alignItems: "center" }}>
            <Text v="scaleNum" color={m2.color.slate}>{String(x)}</Text>
            <View style={{ position: "absolute", left: 1, right: 1, bottom: 0, height: 4, borderRadius: 2, backgroundColor: kind === "carbon" ? m2.color.carbon[x as Carbon][0] : m2.color.health[x as number] }} />
          </View>
        ),
      )}
    </View>
  );
}

/**
 * M2 `gradesHTML`: its own panel beside the label, with its own rules (a 1 dp rule between ratings, none after the last, no heavy
 * bar). Draws a rating only for a scored dish, so an unscored one has no row and no empty one.
 */
export function RatingsPanel({ health, carbon }: { health: number | null; carbon: Carbon | null }) {
  if (health == null && carbon == null) return null;
  return (
    <View style={{ marginTop: m2.space.panel, borderWidth: 2, borderColor: m2.color.dm, paddingHorizontal: m2.space.panel, backgroundColor: m2.color.white }}>
      {health != null ? (
        <View style={{ paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <Text v="lbl" color={m2.color.dm} style={bold}>Healthfulness</Text>
          <Scale kind="health" value={health} label={`${health} of 7`} />
        </View>
      ) : null}
      {carbon != null ? (
        <View style={{ paddingVertical: 10, ...(health != null ? { borderTopWidth: 1, borderTopColor: m2.color.dm } : null) }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <Text v="lbl" color={m2.color.dm} style={bold}>Carbon rating</Text>
            <Scale kind="carbon" value={carbon} label={`${carbon}, on a scale from A to E`} />
          </View>
          <Text v="lblThin" color={m2.color.ink} style={{ marginTop: 6 }}>{`${CARBON_BAND[carbon]} kg CO₂e per kg of food`}</Text>
        </View>
      ) : null}
    </View>
  );
}
