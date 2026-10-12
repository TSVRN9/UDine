// Motion tokens for every timed transition in the app -- named by role, not number, so a duration
// or curve is never hand-copied twice. Source of truth: Prototype.dc.html's <style> block (plus
// MenuLoading.dc.html's spinner); motion.test.ts asserts every spec-anchored value here against it.
import { Easing as RNEasing } from "react-native";
import { Easing as ReanimatedEasing } from "react-native-reanimated";

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
 * Bake-off motion (docs/briefs/hall-menu-bakeoff.md), copied from M2 round 9c's `MO`, `SPRING` and
 * `PUSH_E` in src.html. Easings are raw bezier control points; `emphasized` is M2's two-segment path
 * (EMPH), not expressible as one bezier, so it is a function.
 */
const emphSeg = [
  [0, 0, 0.05, 0, 0.133333, 0.06, 0.166666, 0.4],
  [0.166666, 0.4, 0.208333, 0.82, 0.25, 1, 1, 1],
] as const;
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

export const m2Motion = {
  press: { d: 90, e: [0.2, 0, 0, 1] as const, scale: 0.97 },
  settle: { d: 200, e: [0.2, 0, 0, 1] as const },
  cont: { d: 500 }, // container transform, enter; easing `emphasized`
  contFade: 0.3, // outgoing content is gone by this progress, incoming starts here (src.html paint: fout/fin)
  contBack: { d: 400 }, // same frames reversed
  fadeThrough: { d: 250, e: [0, 0, 0, 1] as const, scale: 0.97, z: 8 },
  sharedX: { d: 450, at: 0.35, dist: 30 }, // easing `emphasized`
  scroll: { d: 500 }, // easing `emphasized`
  exit: { d: 150, e: [0.3, 0, 0.8, 0.2] as const },
  scrub: { d: 200, max: 420, perPx: 0.05 },
  scrim: 0.32,
  dragBack: { dist: 480, commit: 0.82, flick: 0.5 },
  push: { e: [0.32, 0.72, 0, 1] as const, shift: 0.3, dim: 0.1, commit: 0.5 }, // d = cont / contBack
  rmFade: { d: 120 },
  spring: { sheet: { k: 300, z: 0.84 } },
} as const;
