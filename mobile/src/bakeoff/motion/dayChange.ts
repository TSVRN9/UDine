import { m2Motion, type Timing } from "../../lib/motion";

/**
 * The two legs of a day change (M2 `changeDay`, a fade through): what says the day fades out over `sharedX.at` of the fade-through time,
 * linear, then the new one comes in over the rest on the standard decelerate, the list scaling up from `scale`. Reduced motion (M2 `RM`,
 * src.html:1322) swaps the day and crossfades the list: both legs are `rmFade` between them, and nothing scales.
 */
export function dayLegs(reduced: boolean): { out: Timing; in: Timing; scale: number } {
  const { fadeThrough: ft, fadeThroughOut, rmFade, sharedX } = m2Motion;
  if (reduced) return { out: { ...rmFade, d: rmFade.d / 2 }, in: { ...rmFade, d: rmFade.d / 2 }, scale: 1 };
  return { out: { ...fadeThroughOut, d: fadeThroughOut.d * sharedX.at }, in: { ...ft, d: ft.d * (1 - sharedX.at) }, scale: ft.scale };
}
