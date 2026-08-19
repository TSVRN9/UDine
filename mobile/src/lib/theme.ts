/**
 * Mobile design tokens — ports web/src/app.css's @theme block to React Native (StyleSheet only,
 * no component library, no new dependencies). Same names, same roles as web:
 *
 *   maroon900/maroon600  brand + primary accent
 *   gold500               signature accent, used sparingly
 *   cream100/paper50       page ground / card surface
 *   ink900                 body text (muted via withOpacity, mirroring web's color-mix opacity trick)
 *
 * Web loads Oswald (display) + Libre Franklin (body) as webfonts. Mobile has no bundled font
 * assets (adding them would be a new dependency/asset pipeline this ticket doesn't call for), so
 * `fonts` mirrors the *role* — display/body/mono — using each platform's built-in font stack
 * instead of the exact typeface. Consuming styles still apply the uppercase+tracking+weight that
 * gives headings their condensed-signage feel.
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
  display: Platform.select({ ios: "System", android: "sans-serif-condensed", default: "System" }),
  body: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
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
