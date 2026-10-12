import { m2Motion } from "../../lib/motion";

export interface VRect { top: number; height: number }
const clamp = (x: number) => {
  "worklet";
  return Math.min(1, Math.max(0, x));
};

/** The container window (M2 paint: WT = T*q, WB = H - q*(H - T - BH)); the full-width band grows to the screen. */
export function rectAt(from: VRect, to: VRect, p: number): VRect {
  "worklet";
  return { top: from.top + (to.top - from.top) * p, height: from.height + (to.height - from.height) * p };
}
export function outgoingOpacity(p: number): number {
  "worklet";
  return 1 - clamp(p / m2Motion.contFade);
}
export function incomingOpacity(p: number): number {
  "worklet";
  return clamp((p - m2Motion.contFade) / (1 - m2Motion.contFade));
}
/** v: px/ms, positive toward closing. M2: close below the commit point or on a flick past the threshold. */
export function settleTarget(v: number, p: number): "open" | "closed" {
  "worklet";
  return p < m2Motion.dragBack.commit || v > m2Motion.dragBack.flick ? "closed" : "open";
}

export type Phase = "closed" | "opening" | "open" | "closing" | "dragging";
export interface Machine { phase: Phase; run: number }
export type Event =
  | { type: "open" } | { type: "close" } | { type: "grab" }
  | { type: "release"; to: "open" | "closed" } | { type: "done"; run: number };

/**
 * Every animated phase starts a new `run`; a `done` from a cancelled run is ignored, so an interrupted
 * open/close never completes the wrong way. The overlay is mounted (and the source band hidden) in every
 * phase but "closed", which only a finished close reaches.
 */
export function transition(m: Machine, e: Event): Machine {
  const go = (phase: Phase): Machine => ({ phase, run: m.run + 1 });
  switch (e.type) {
    case "open": return m.phase === "closed" || m.phase === "closing" ? go("opening") : m;
    case "close": return m.phase === "open" || m.phase === "opening" ? go("closing") : m;
    case "grab": return m.phase === "closed" || m.phase === "dragging" ? m : { phase: "dragging", run: m.run + 1 };
    case "release": return m.phase === "dragging" ? go(e.to === "open" ? "opening" : "closing") : m;
    case "done":
      if (e.run !== m.run) return m;
      return m.phase === "opening" ? { ...m, phase: "open" } : m.phase === "closing" ? { ...m, phase: "closed" } : m;
  }
}
