/**
 * What the menu list may be doing: nothing, a day change (the old rows held over the new day: `holding` until the new day is
 * drawn, `fading` while the old content fades out and the new fades in) or a meal change's slide. Only one at a time: a change that
 * arrives while another runs is refused (the caller drops it), so no interleaving can leave the labels or the held rows stranded.
 * `pagerStep` returns the next phase, or null when the event is refused or does not apply.
 */
export type Phase = "idle" | "holding" | "fading" | "sliding";
export type PagerEvent = "hold" | "shift" | "ready" | "done";

export function pagerStep(phase: Phase, e: PagerEvent): Phase | null {
  switch (e) {
    case "hold": return phase === "idle" ? "holding" : null;
    case "shift": return phase === "idle" ? "sliding" : null;
    case "ready": return phase === "holding" ? "fading" : null;
    case "done": return phase === "fading" || phase === "sliding" ? "idle" : null;
  }
}
