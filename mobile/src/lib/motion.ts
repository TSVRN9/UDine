// Motion tokens for every timed transition in the app -- named by role, not number, so a duration
// or curve is never hand-copied twice. Source of truth: Prototype.dc.html's <style> block (plus
// MenuLoading.dc.html's spinner); motion.test.ts asserts every spec-anchored value here against it.
import { Easing as RNEasing } from "react-native";
import { Easing as ReanimatedEasing, type WithTimingConfig } from "react-native-reanimated";
import { m2Curves, m2MotionData } from "./m2.generated";

/** The one cubic-bezier every eased transition in the artboard shares (`.pane`/`.knob`/`.sheet`/
 * `.strip`/`.layer`/`.toastbox`). Raw control points, not a built `Easing` object: RN's `Easing`
 * and Reanimated's `Easing` are separate modules -- a Reanimated `withTiming` given RN's plain
 * (non-worklet) bezier function is not guaranteed to run correctly on the UI thread on-device, so
 * each library gets its own curve built from the same four numbers (below), not a shared function
 * value passed across the boundary. */
export const curves = {
  pane: [0.22, 0.61, 0.36, 1] as const,
  /** CSS's keyword `ease` (the spec's bezier for it) -- `.pane`/`.fade`/`.toastbox` opacity. */
  ease: [0.25, 0.1, 0.25, 1] as const,
};

/** Built once, from `curves.pane`, for Reanimated `withTiming` call sites. */
export const reanimatedPaneCurve = ReanimatedEasing.bezier(...curves.pane);
/** Built once, from `curves.ease`, for Reanimated `withTiming` call sites (Toast's opacity). */
export const reanimatedEaseCurve = ReanimatedEasing.bezier(...curves.ease);
/** Built once, from `curves.pane`, for RN core `Animated.timing` call sites. */
export const rnPaneCurve = RNEasing.bezier(...curves.pane);

/** Every constant-speed spin (Skeleton.tsx's `Spinner`, both the gold MenuLoading spinner and
 * PlateSheet's maroon search spinner) shares this same linear curve -- centralized here for the
 * same reason as `rnPaneCurve` above, so a call site never spells `Easing.linear` itself. */
export const rnSpinCurve = RNEasing.linear;

export const durations = {
  /** `.pane` transform -- PaneStack/MealTabPager's pane crossfade. */
  pane: 340,
  /** `.pane` opacity. */
  paneFade: 260,
  /** PaneHeader's own title crossfade (Prototype.dc.html:1305 `titleStyle`) -- tuned separately
   * from the shared `.pane` duration above (320, not 340). */
  paneTitle: 320,
  /** Same `titleStyle`, opacity (240, not 260). */
  paneTitleFade: 240,
  /** `.sheet` transform -- the three house bottom sheets. */
  sheet: 300,
  /** `.press` / `.pressd` -- tap feedback. */
  press: 120,
  /** `.tgl` / `.knob` -- Toggle's track and knob (both tuned to the same 180ms in the spec). */
  toggle: 180,
  /** `.tab` -- tab-row color/border-color. No call site yet (see motion.test.ts's "spec selectors
   * with no code equivalent" list). */
  tab: 200,
  /** `.fade` -- plain opacity fade. No call site yet. */
  fade: 240,
  /** `.toastbox` -- toast opacity+transform (components/Toast.tsx enter and exit). */
  toast: 260,
  /** `.sk` shimmer sweep (Skeleton.tsx). */
  shimmer: 1400,
  /** MenuLoading.dc.html's spinner (`animation: spin 1s linear infinite`). */
  spin: 1000,
  /** SearchLookupStates.dc.html's spinner (`animation: spin 0.9s linear infinite`) -- PlateSheet's
   * search loading state; a different spec from MenuLoading.dc.html's `spin` above (0.9s not 1s). */
  searchSpin: 900,
  /** The hold-slide pill's grow-out-of-the-button, and the in-plate stepper's width grow -- no
   * `Prototype` selector of its own; anchored to `.tgl`/`.knob`'s 180ms as the closest "quick UI
   * chrome" role. */
  servingsPill: 180,
  /** FavoriteStar's press-pop (scale up, then settle) -- not in the spec at all; values kept
   * exactly as they were, just centralized. */
  favoritePop: { in: 90, out: 120 },
  /** halls/[slug].tsx dish row's LinearTransition (plate/expand state change) -- unspecced. */
  rowLayout: 180,
  /** halls/[slug].tsx expanded-content reveal (FadeIn) -- unspecced. */
  rowExpandIn: 160,
  /** halls/[slug].tsx expanded-content dismissal (FadeOut) -- unspecced. */
  rowExpandOut: 120,
  /** halls/[slug].tsx station scrubber's highlight segment sliding to a new station, on normal
   * scroll or drag-to-scrub -- unspecced (no design-canvas artboard exists for this component,
   * see the PR body), anchored to `.tgl`/`.knob`'s 180ms "quick UI chrome" role like servingsPill
   * above. */
  stationHighlight: 180,
  /** Same screen's floating station-name label appearing/dismissing on hold -- unspecced, paired
   * in/out like favoritePop above. */
  stationLabel: { in: 120, out: 150 },
} as const;

/** How long a success toast stays before dismissing itself. A failure toast has no dwell: it stays
 * until the next log attempt, a plate edit, or a tap. Unspecced (no artboard timing). */
export const toastDwell = 4000;

/** Same, for a success toast that carries an action ("Rate them", "Another"): long enough to read
 * the sub-line and reach the action. Unspecced (head-to-head brief default 2). */
export const toastActionDwell = 6000;

/** How far a toast travels while it fades in/out: `toastStyle`'s `translateY(12px)` in Prototype.dc.html. */
export const toastRise = 12;

/**
 * Bake-off motion (docs/briefs/hall-menu-bakeoff.md): M2 round 9c's `MO`, `SPRING` and `PUSH_E` from src.html, generated from
 * `design-tokens/m2.json` (`pnpm tokens`). The data carries easings as bezier control points or a name; `m2Motion` is that data with each `e`
 * built once, here, into the function the kit's `timed` hands to Reanimated. `emphasized` is M2's two-segment path (EMPH), not one bezier.
 */
const emphSeg = m2Curves.emphasized;
/** cubic-bezier(0, 0, 0, 1) (M3 standard decelerate, `fadeThrough.e`) in closed form: x = t^3, y = 3t^2 - 2t^3. Reanimated's own
 * Easing.bezier overshoots on this degenerate curve (measured f = 8.3 on device). */
export function standardDecelerate(x: number): number {
  "worklet";
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const t = Math.cbrt(x);
  return t * t * (3 - 2 * t);
}

export function emphasized(x: number): number {
  "worklet";
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const s = x <= 0.166666 ? emphSeg[0] : emphSeg[1];
  const bez = (a: number, b: number, c: number, d: number, t: number) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };
  let lo = 0;
  let hi = 1;
  let t = 0.5;
  for (let i = 0; i < 30; i++) {
    t = (lo + hi) / 2;
    if (bez(s[0], s[2], s[4], s[6], t) < x) lo = t;
    else hi = t;
  }
  return bez(s[1], s[3], s[5], s[7], t);
}

/** What `timed` gives Reanimated's `withTiming` as its `easing`. */
export type Curve = NonNullable<WithTimingConfig["easing"]>;
/** A motion token that moves something: how long, and on what curve. `timed` takes nothing else. */
export interface Timing { readonly d: number; readonly e: Curve }

const named: Record<string, Curve> = { emphasized, linear: ReanimatedEasing.linear };
function build(e: string | readonly number[]): Curve {
  if (typeof e === "string") return named[e];
  const [a, b, c, d] = e;
  // the degenerate standard decelerate has a closed form (see standardDecelerate)
  return a === 0 && b === 0 && c === 0 && d === 1 ? standardDecelerate : ReanimatedEasing.bezier(a, b, c, d);
}
type Built<T> = { [K in keyof T]: T[K] extends { readonly e: unknown } ? Omit<T[K], "e"> & { readonly e: Curve } : T[K] };

export const m2Motion = Object.fromEntries(
  Object.entries(m2MotionData).map(([k, v]) => [k, v && typeof v === "object" && "e" in v ? { ...v, e: build(v.e as string | readonly number[]) } : v]),
) as Built<typeof m2MotionData>;

/** M2's `SPRING.sheet` (stiffness k, damping ratio z) as the stiffness / damping / mass a spring takes: c = 2 sqrt(k m) z, with m = 1. */
export const m2SheetSpring = { stiffness: m2Motion.spring.sheet.k, damping: 2 * Math.sqrt(m2Motion.spring.sheet.k) * m2Motion.spring.sheet.z, mass: 1 } as const;

/** Linear, and M2's `settle` and push curves as Reanimated easings. */
export const m2Linear = named.linear;
export const m2SettleEasing = m2Motion.settle.e;
export const m2PushEasing = m2Motion.push.e;
