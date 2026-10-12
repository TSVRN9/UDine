import type { ReactNode } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { Text } from "./Text";

/** A hall band (112) or pinned café (84, `compact`): photo slot, M2's deep-maroon left grade, name and status.
 * `letter` is a slot (see HallLetter). */
export function Band({ name, status, photo, letter, compact, onPress }: {
  name: string; status?: ReactNode; photo?: ReactNode; letter?: ReactNode; compact?: boolean; onPress?: () => void;
}) {
  return (
    <Press feedback="tint" accessibilityRole="button" accessibilityLabel={name} onPress={onPress}
      style={{ height: compact ? 84 : m2.size.band, overflow: "hidden", backgroundColor: m2.color.vm, marginTop: 1 }}>
      {photo}
      <LinearGradient colors={["rgba(59,10,15,0.82)", "rgba(59,10,15,0.55)", "rgba(59,10,15,0)"]} locations={[0, 0.45, 0.75]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} pointerEvents="none" />
      {letter}
      <View style={{ position: "absolute", left: m2.space[4], top: compact ? 14 : m2.space[3] + 4 }}>
        <Text v={compact ? "pinName" : "bandName"} color={m2.color.white}>{name}</Text>
        {status ? <Text v={compact ? "statusSm" : "status"} color={m2.color.onDmSoft} style={{ marginTop: compact ? 6 : 7 }}>{status}</Text> : null}
      </View>
    </Press>
  );
}
