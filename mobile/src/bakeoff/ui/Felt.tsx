import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { m2 } from "../../lib/theme";

/** The stitched patch the kit's felt things share: a ground, and a dashed line sewn just inside its edge (M2 `.tg::after`, `.mk::after`, `.evpatch::after`). */
export type FeltKind = "patch" | "mark" | "frame";
const GROUND: Record<FeltKind, string> = { patch: m2.color.gold, mark: m2.color.gold, frame: m2.color.vm };
const STITCH: Record<FeltKind, string> = { patch: m2.color.stitch, mark: m2.color.stitch, frame: m2.color.stitchGold };

/**
 * `patch` is the 20 dp diet badge and the hall letter on a chip (gold felt, maroon stitch), `mark` the dish sheet's 30 dp one, `frame` the maroon
 * felt an event's banner sits in (its stitch is gold, run around the picture, never over it). `style` sizes it; `children` sit on the felt.
 */
export function Felt({ kind, style, children, ...p }: { kind: FeltKind; style?: StyleProp<ViewStyle>; children?: ReactNode } & Omit<React.ComponentProps<typeof View>, "style" | "children">) {
  const f = m2.felt[kind];
  return (
    <View {...p} style={[{ borderRadius: f.radius, backgroundColor: GROUND[kind] }, kind === "frame" ? { padding: m2.felt.frame.pad, overflow: "hidden" } : null, style]}>
      {children}
      <View pointerEvents="none" style={{ position: "absolute", top: f.inset, left: f.inset, right: f.inset, bottom: f.inset, borderRadius: f.stitchRadius, borderWidth: f.stitchWidth, borderStyle: "dashed", borderColor: STITCH[kind] }} />
    </View>
  );
}
