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

/** How far a toast travels while it fades in/out: `toastStyle`'s `translateY(12px)` in Prototype.dc.html. */
export const toastRise = 12;
