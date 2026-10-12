import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { m2 } from "../../lib/theme";

type AStyle = React.ComponentProps<typeof Animated.View>["style"];

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
const IMG_ASPECT = 640 / 341;

/**
 * A UMass photo, `cover`-fitted to width x height with the horizontal focus `pos` (CSS background-position x), in
 * full colour with M2's grayscale duotone laid over it (`duo` styles that layer's opacity; no style means shown).
 * The photo itself is never blurred, cropped beyond the fit, or otherwise altered.
 */
export function Photo({ source, width, height, pos = 0.5, duo, style }: {
  source: ImageSourcePropType; width: number; height: number; pos?: number; duo?: AStyle; style?: StyleProp<ViewStyle>;
}) {
  const w = Math.max(width, height * IMG_ASPECT);
  const h = w / IMG_ASPECT;
  const img = { position: "absolute", width: w, height: h, left: (width - w) * pos, top: 0 } as const;
  return (
    <View style={[{ width, height, overflow: "hidden" }, style]} pointerEvents="none">
      <Image source={source} style={img} />
      <Animated.View style={[fill, { isolation: "isolate" }, duo]}>
        <View style={[fill, { filter: [{ grayscale: 1 }, { contrast: 1.12 }] }]}>
          <Image source={source} style={img} />
        </View>
        <View style={[fill, { backgroundColor: "#c4434b", mixBlendMode: "multiply" }]} />
        <View style={[fill, { backgroundColor: m2.color.dm, mixBlendMode: "screen" }]} />
      </Animated.View>
    </View>
  );
}
