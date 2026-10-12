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
  // Darker gold for macro-badge glyph fills -- gold500 itself is too light for a solid icon shape
  // to read against its own translucent circle backdrop (MenuWithBadges.dc.html's badge icons).
  gold700: "#8a6a1a",
  cream100: "#f3ead8",
  paper50: "#fbf7ef",
  ink900: "#241a14",
  // Added for the add-item flow's USDA search-result badge (#91 follow-on) -- a muted sage green,
  // distinct from maroon600 (UMass badge)/gold500 (Custom badge)/grey (Packaged badge) per the
  // approved canvas. No existing token was close enough to reuse.
  sage600: "#6b8a5e",
  // One accent per macro-badge preset, replacing the single shared gold700 (owner bug report
  // 2026-09-12: "the badges still don't have colors") -- docs/design/BadgeConcepts.dc.html, "one
  // accent color per preset ... each reaches for the macro's own real-world association". Each
  // preset's circle background is this color at low opacity (withOpacity), not a new token.
  macroProteinAccent: "#a6432f",
  macroSodiumAccent: "#5b7c8c",
  macroCalorieAccent: "#c17a35",
  macroFatAccent: "#c9a12a",
  macroFiberAccent: "#6b8555",
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

/**
 * Bake-off tokens (docs/briefs/hall-menu-bakeoff.md), copied from M2 round 9c: `src.html`'s `:root`,
 * its type rules and its score ramps (`CRC`/`HFC`). Only src/bakeoff reads this; shipped tokens above
 * are untouched. Sizes are M2's px as dp, unscaled (the meal row is laid out for 360dp at 14).
 */
export const m2 = {
  color: {
    dm: "#3b0a0f",
    vm: "#881c1c",
    gold: "#c99a2e",
    chalk: "#f8f9fb",
    ink: "#24171a",
    slate: "#6e6266",
    tint: "#f3e4e4",
    hair: "rgba(36,23,26,0.12)",
    field: "#eceef2",
    white: "#ffffff",
    onDm: "rgba(255,255,255,0.8)",
    onDmSoft: "rgba(255,255,255,0.86)",
    divider: "rgba(255,255,255,0.14)",
    pressRow: "rgba(36,23,26,0.06)",
    pressDark: "rgba(255,255,255,0.08)",
    felt: "#5a1820",
    scrim: "rgba(36,10,14,1)",
    // [tile, ink]
    carbon: {
      A: ["#0d6d3a", "#0d6d3a"],
      B: ["#9bcb3b", "#3d5c0a"],
      C: ["#dbe11d", "#4f5208"],
      D: ["#bcbdc0", "#45464a"],
      E: ["#818285", "#2f3033"],
    } as Record<"A" | "B" | "C" | "D" | "E", readonly [string, string]>,
    health: ["#cfe0f2", "#b4cbe3", "#98b5d4", "#7da0c5", "#618ab7", "#4675a8", "#2a5f99", "#0f4a8a"] as readonly string[],
    healthInk: "#0f3a66",
  },
  font: {
    body: fonts.body400,
    bodyMd: fonts.body500,
    bodySb: fonts.body600,
    num: fonts.display500,
    numSb: fonts.display600,
    numB: fonts.display700,
  },
  // size / lineHeight, M2's CSS rules
  type: {
    mealTab: { size: 14, line: 17 },
    tabBar: { size: 12, line: 15 },
    brand: { size: 22, line: 26 },
    date: { size: 15, line: 20 },
    hallTitle: { size: 52, line: 55 },
    bandName: { size: 32, line: 32 },
    pinName: { size: 24, line: 24 },
    menuName: { size: 40, line: 40 },
    status: { size: 15, line: 20 },
    statusSm: { size: 14, line: 18 },
    section: { size: 22, line: 26 },
    station: { size: 20, line: 20 },
    stationHead: { size: 22, line: 26 },
    day: { size: 20, line: 20 },
    rowName: { size: 16, line: 20 },
    meta: { size: 13, line: 17 },
    metaNum: { size: 15, line: 20 },
    stepper: { size: 20, line: 24 },
    letter: { size: 18, line: 18 },
    tile: { size: 14, line: 14 },
    button: { size: 16, line: 20 },
    link: { size: 15, line: 20 },
    empty: { size: 16, line: 23 },
    sched: { size: 15, line: 22 },
    schedHead: { size: 28, line: 32 },
    dayRow: { size: 17, line: 22 },
    // the dish sheet (M2 `.dish`, `.label`, `.grades`)
    dishName: { size: 28, line: 32 },
    price: { size: 20, line: 20 },
    mark: { size: 16, line: 16 },
    sheetHead: { size: 20, line: 24 },
    sheetHeadSm: { size: 17, line: 20 },
    chip: { size: 18, line: 18 },
    action: { size: 17, line: 22 },
    labelTitle: { size: 30, line: 33 },
    calNum: { size: 44, line: 44 },
    dv: { size: 16, line: 20 },
    lbl: { size: 15, line: 21 },
    lblLg: { size: 18, line: 22 },
    lblThin: { size: 13, line: 18 },
    lblFoot: { size: 12, line: 16 },
    scaleNum: { size: 14, line: 14 },
    ing: { size: 15, line: 22.5 },
  },
  space: [4, 8, 12, 16, 20, 24, 32] as const,
  radius: { patch: 4, thumb: 5, card: 6, button: 8, sheet: 16, pill: 999 },
  size: { tabBar: 56, row: 64, tabs: 48, stationRow: 50, band: 112, tap: 44, tile: [18, 22.5], tileSheet: [24, 30], tileScale: [26, 32.5] },
} as const;
