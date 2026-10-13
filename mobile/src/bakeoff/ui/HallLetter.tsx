import { Image, View } from "react-native";
import { m2 } from "../../lib/theme";

// Pre-rendered by scripts/bakeoff-letters.js from M2's own paths (Oswald 700 at 210 px, a white felt stroke under a gold fill with a dashed
// maroon stitch, the letter at M2's `LX` in the 200 px box). An Svg is rasterised in software on the UI thread on every draw.
const LETTER = {
  W: require("../../../assets/bakeoff/letters/W.png"),
  F: require("../../../assets/bakeoff/letters/F.png"),
  H: require("../../../assets/bakeoff/letters/H.png"),
  B: require("../../../assets/bakeoff/letters/B.png"),
} as const;

/** The band's chenille varsity letter: the 200 dp box, right-aligned to its parent (so the letter keeps its distance from the right edge at any
 * width; the letter's place in the box is baked in, see logic/letters.ts). */
export function HallLetter({ letter, top = -m2.space.letterRise }: { letter: keyof typeof LETTER; top?: number }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: 0, top, width: m2.size.letterBox, height: m2.size.letterBox }}>
      <Image source={LETTER[letter]} fadeDuration={0} style={{ width: m2.size.letterBox, height: m2.size.letterBox }} />
    </View>
  );
}
