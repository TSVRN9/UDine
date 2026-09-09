/**
 * Mobile design tokens — ports web/src/app.css's @theme block to React Native (StyleSheet only,
 * no component library). Same names, same roles as web:
 *
 *   maroon900/maroon600  brand + primary accent
 *   gold500               signature accent, used sparingly
 *   cream100/paper50       page ground / card surface
 *   ink900                 body text (muted via withOpacity, mirroring web's color-mix opacity trick)
 *
 * Fonts are the real Oswald/Libre Franklin families (@expo-google-fonts, loaded in _layout.tsx).
 * Each weight is its own family name on RN — use the weighted keys (`display700`, `body600`, …)
 * and do NOT pair them with `fontWeight`, which fake-bolds an already-weighted family on Android.
 * The unweighted `display`/`body` keys are legacy aliases for screens not yet on the v2 canvas.
 */
import { Dimensions, Platform } from "react-native";

export const colors = {
  maroon900: "#3b0a0f",
  maroon600: "#7c2430",
  gold500: "#c99a2e",
  cream100: "#f3ead8",
  paper50: "#fbf7ef",
  ink900: "#241a14",
  // Added for the add-item flow's USDA search-result badge (#91 follow-on) -- a muted sage green,
  // distinct from maroon600 (UMass badge)/gold500 (Custom badge)/grey (Packaged badge) per the
  // approved canvas. No existing token was close enough to reuse.
  sage600: "#6b8a5e",
} as const;

/**
 * Per-hall card gradients from the canvas's Home artboard (120° top-left → bottom-right).
 * Berkshire's open pair reuses the canvas's dark-maroon gradient (PushAlerts backdrop) since its
 * artboard card only shows the closed state. `hallGradientClosed` is that closed state: a washed
 * translucent pair over the cream ground, shared by every hall.
 */
export const hallGradients: Record<string, [string, string]> = {
  worcester: ["#7c2430", "#3b0a0f"],
  franklin: ["#8a3a2c", "#3b0a0f"],
  hampshire: ["#6b2f1e", "#2c0a08"],
  berkshire: ["#4a1218", "#241a14"],
};
export const hallGradientClosed: [string, string] = ["rgba(59,10,15,0.55)", "rgba(36,26,20,0.75)"];

/**
 * `hex` at `opacityPct`, as a hex-with-alpha string. Mirrors web's
 * `color-mix(in srgb, var(--color-x) N%, transparent)` opacity trick, which app.css leans on for
 * every muted-text/border tone instead of a 7th named color token.
 */
export function withOpacity(hex: string, opacityPct: number): string {
  const clamped = Math.max(0, Math.min(100, opacityPct));
  const alpha = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}

export const fonts = {
  display500: "Oswald_500Medium",
  display600: "Oswald_600SemiBold",
  display700: "Oswald_700Bold",
  body400: "LibreFranklin_400Regular",
  body500: "LibreFranklin_500Medium",
  body600: "LibreFranklin_600SemiBold",
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  // Legacy aliases — screens the v2 canvas hasn't reached yet still say fonts.display/fonts.body,
  // sometimes with a fontWeight alongside (harmless fake-bold on Android, correct on iOS).
  display: "Oswald_600SemiBold",
  body: "LibreFranklin_400Regular",
} as const;

/**
 * Width-proportional type scale. The canvas artboards are drawn at 390dp; their font sizes are
 * used verbatim on 390dp-and-wider screens (capped at 1 — never upscales) and scale down
 * proportionally on narrower ones, so text keeps the artboard's layout ratios instead of wrapping.
 * Fonts and lineHeights only — paddings and touch targets (44dp) deliberately don't scale.
 * ponytail: window width read once at module load — fine for phones; revisit with a
 * useWindowDimensions-driven scale if tablets/rotation ever matter.
 */
const DESIGN_WIDTH = 390;
const typeScale = Math.min(1, Dimensions.get("window").width / DESIGN_WIDTH);
export function fs(size: number): number {
  return Math.round(size * typeScale);
}

export const radii = {
  sm: 2,
  md: 6,
  pill: 999,
} as const;

/** Tailwind's default 4px spacing step, scaled by the same width-proportional factor as type
 * (see fs above) — the canvas's paddings/gaps are drawn at 390dp too, and unscaled whitespace
 * around scaled text reads oversized on narrow screens (owner feedback, 2026-08-20). */
export function spacing(steps: number): number {
  return Math.round(steps * 4 * typeScale);
}

export type ButtonVariant = "primary" | "secondary" | "ghost";

/** Mirrors .btn-primary / .btn-secondary / .btn-ghost in app.css's component layer. */
export function buttonColors(variant: ButtonVariant): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  switch (variant) {
    case "primary":
      return { backgroundColor: colors.maroon600, color: colors.paper50, borderColor: "transparent" };
    case "secondary":
      return { backgroundColor: "transparent", color: colors.maroon600, borderColor: withOpacity(colors.maroon600, 45) };
    case "ghost":
      return { backgroundColor: "transparent", color: withOpacity(colors.ink900, 65), borderColor: "transparent" };
  }
}
