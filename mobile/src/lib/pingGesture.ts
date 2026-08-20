/**
 * Pure logic for the Social pane's hold-and-release bubble ping (#93 canvas artboard
 * "Ping - hold + release"): a friend avatar HOLD opens a speech-bubble overlay with a shuffled
 * message + the 4 hall rows; the user slides down and RELEASES over a hall to send, or drags away
 * to cancel. Kept free of React Native so the state machine, hit-testing, and message pick can be
 * red-green tested in plain jest without mounting anything.
 */

export const PING_MESSAGES = ["Let's go to…", "Come to…", "Meet me at…", "Grab a bite at…", "Swing by…"] as const;

/** Picks one of PING_MESSAGES, shuffled per hold. `rng` defaults to Math.random but takes an
 * injected `() => number` in [0, 1) for deterministic tests. */
export function pickPingMessage(rng: () => number = Math.random): string {
  const index = Math.min(PING_MESSAGES.length - 1, Math.floor(rng() * PING_MESSAGES.length));
  return PING_MESSAGES[index];
}

export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

/** Which hall's rect (if any) contains `point`. Rects are expected not to overlap (4 stacked hall
 * rows); if they did, the first match wins. */
export function hallAtPoint(point: Point, hallRects: { hallTid: number; rect: Rect }[]): number | null {
  for (const { hallTid, rect } of hallRects) {
    if (point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height) {
      return hallTid;
    }
  }
  return null;
}

export type PingGestureState =
  | { phase: "idle" }
  | { phase: "holding"; friendId: string; message: string; hoverHallTid: number | null };

export type PingGestureEvent =
  | { type: "HOLD_START"; friendId: string; message: string }
  | { type: "HOVER"; hallTid: number | null }
  | { type: "RELEASE" }
  | { type: "CANCEL" };

export const IDLE_STATE: PingGestureState = { phase: "idle" };

/** hold -> bubble -> hover-hall -> release/cancel, as a pure reducer. */
export function pingGestureReducer(state: PingGestureState, event: PingGestureEvent): PingGestureState {
  switch (event.type) {
    case "HOLD_START":
      return { phase: "holding", friendId: event.friendId, message: event.message, hoverHallTid: null };
    case "HOVER":
      return state.phase === "holding" ? { ...state, hoverHallTid: event.hallTid } : state;
    case "RELEASE":
    case "CANCEL":
      return IDLE_STATE;
  }
}

export type PingPayload = { friendId: string; hallTid: number; message: string };

/** Reads the pre-release state to decide what to send -- call this BEFORE dispatching RELEASE,
 * since the reducer resets to idle on RELEASE. Null when not holding, or holding but not hovering
 * any hall (release-away-from-every-hall cancel). */
export function buildPingPayload(state: PingGestureState): PingPayload | null {
  if (state.phase !== "holding" || state.hoverHallTid === null) return null;
  return { friendId: state.friendId, hallTid: state.hoverHallTid, message: state.message };
}
