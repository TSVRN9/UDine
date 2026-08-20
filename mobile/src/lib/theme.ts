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
import { Platform } from "react-native";

export const colors = {
  maroon900: "#3b0a0f",
  maroon600: "#7c2430",
  gold500: "#c99a2e",
  cream100: "#f3ead8",
  paper50: "#fbf7ef",
  ink900: "#241a14",
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

export const radii = {
  sm: 2,
  md: 6,
  pill: 999,
} as const;

/** Tailwind's default 4px spacing step, used as-is on web — same step here. */
export function spacing(steps: number): number {
  return steps * 4;
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
