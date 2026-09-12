import type { MacroPreset } from "@udine/shared";
import { Circle, Path, Rect } from "react-native-svg";

/**
 * Single shared source for the 5 macro-preset glyph shapes (dumbbell/salt-pile/flame/leaf/droplet),
 * 20x20 viewBox. Canonical geometry per docs/design/BadgeConcepts.dc.html's "on a dish row, at
 * shipped size (15px)" section.
 *
 * Used by both mobile/src/app/halls/[slug].tsx's MacroBadgeIcon (hall-menu dish row) and
 * FilterSheet.tsx's MacroChipIcon (Macros filter chips) -- these used to be two independently-
 * copied path sets (FilterSheet's own doc comment cited FilterSheet.dc.html directly) and drifted
 * apart: 3 of FilterSheet's 5 shapes went stale relative to the shipped badge. One shared source
 * means they can't diverge again.
 *
 * `color` fills the main shape; `detailColor` fills the smaller cutout/accent pieces (the salt
 * pile's 3 dots, the flame's inner curl, the leaf's stem highlight, the droplet's cutout). Callers
 * with no two-tone need (FilterSheet's chips) pass the same value for both.
 */
export function MacroPresetGlyph({ preset, color, detailColor }: { preset: MacroPreset; color: string; detailColor: string }) {
  switch (preset) {
    case "high-protein":
      return (
        <>
          <Rect x={3.7} y={8} width={1.3} height={4} rx={0.5} fill={color} />
          <Rect x={5.2} y={6.5} width={1.8} height={7} rx={0.7} fill={color} />
          <Rect x={7} y={9.2} width={6} height={1.6} rx={0.8} fill={color} />
          <Rect x={13} y={6.5} width={1.8} height={7} rx={0.7} fill={color} />
          <Rect x={15} y={8} width={1.3} height={4} rx={0.5} fill={color} />
        </>
      );
    case "low-sodium":
      return (
        <>
          <Path
            d="M10 5.2c.35 0 .68.18.85.48l4.6 8c.4.68-.1 1.52-.85 1.52H5.4c-.75 0-1.25-.84-.85-1.52l4.6-8c.17-.3.5-.48.85-.48z"
            fill={color}
          />
          <Circle cx={9} cy={10.5} r={0.55} fill={detailColor} />
          <Circle cx={11.6} cy={12} r={0.5} fill={detailColor} />
          <Circle cx={10.3} cy={8.3} r={0.45} fill={detailColor} />
        </>
      );
    case "under-300-cal":
      return (
        <>
          <Path
            d="M10 3.5c-2.3 2.9-3.7 5.1-3.7 7 0 2.7 1.9 4.8 4.2 4.8s4.2-2.1 4.2-4.8c0-1.1-.3-2.1-.9-3 0 1.1-.6 1.9-1.4 1.9-.9 0-1.5-.8-1.1-1.8.6-1.5 0-2.9-1.3-4.1z"
            fill={color}
          />
          <Path
            d="M10 9.3c-1 1.3-1.5 2.3-1.5 3.1a1.5 1.5 0 0 0 3 0c0-.5-.2-1-.5-1.5.1.5-.2.9-.7.9s-.8-.4-.6-.9c.2-.5.4-1 .3-1.6z"
            fill={detailColor}
          />
        </>
      );
    case "high-fiber":
      return (
        <>
          <Path d="M10 3.6c-2.6 3-4 5.1-4 6.8a4 4 0 0 0 8 0c0-1.7-1.4-3.8-4-6.8z" fill={color} />
          <Path d="M10 10.4v5.6" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
          <Rect x={9.4} y={6.6} width={1.2} height={4.4} rx={0.6} fill={detailColor} />
        </>
      );
    case "low-fat":
      return (
        <>
          <Path
            d="M10 3.8c-2.6 3.2-4.1 5.7-4.1 7.7a4.1 4.1 0 0 0 8.2 0c0-2-1.5-4.5-4.1-7.7z"
            fill={color}
          />
          <Circle cx={8.2} cy={9.6} r={1.15} fill={detailColor} />
        </>
      );
    default:
      preset satisfies never;
      return null;
  }
}
