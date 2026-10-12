import type { ReactNode } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { Text } from "./Text";
import { useArrive } from "./arrive";

/** A hall band is 112 high, a pinned café 84 (`compact`). */
export const bandHeight = (compact?: boolean) => (compact ? m2.size.pin : m2.size.band);

interface FaceProps {
  name: string; status?: ReactNode; /** the status arrived from the network just now: it fades in where it ends up */ arrive?: boolean;
  photo?: ReactNode; /** a slot (see HallLetter) */ letter?: ReactNode; compact?: boolean; busy?: ReactNode;
}

/**
 * What a band shows, as the children of whatever frames it: the photo slot, M2's deep-maroon left grade, the letter, then the name, status
 * and busy row, which sit above a press layer a `Band` lays over the rest (`zIndex`). The band's copy that rides a container transform draws it alone.
 */
export function BandFace({ name, status, arrive, photo, letter, compact, busy }: FaceProps) {
  const { arriveIn } = useArrive();
  const g = m2.gradient.band;
  return (
    <>
      {photo}
      <LinearGradient colors={[...g.stops]} locations={[...g.locations]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} pointerEvents="none" />
      {letter}
      <View style={{ position: "absolute", zIndex: 1, left: m2.space.gutter, top: compact ? m2.space.pinTextTop : m2.space.bandTextTop }}>
        <Text v={compact ? "pinName" : "bandName"} color={m2.color.white}>{name}</Text>
        {status ? <Animated.View entering={arrive ? arriveIn : undefined}><Text v={compact ? "statusSm" : "status"} color={m2.color.onDmSoft} style={{ marginTop: compact ? m2.space.pinStatusTop : m2.space.bandStatusTop }}>{status}</Text></Animated.View> : null}
        {busy}
      </View>
    </>
  );
}

/** A hall band or pinned café: a button on the deep-maroon ground, 1 dp under the one above, tinting under the finger (M2 `.band .press`). */
export function Band({ onPress, ...face }: FaceProps & { onPress?: () => void }) {
  return (
    <Press feedback="tint" tint="band" accessibilityRole="button" accessibilityLabel={face.name} onPress={onPress}
      style={{ height: bandHeight(face.compact), overflow: "hidden", backgroundColor: m2.color.vm, marginTop: 1 }}>
      <BandFace {...face} />
    </Press>
  );
}
