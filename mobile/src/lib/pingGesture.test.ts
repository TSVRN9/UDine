import {
  buildPingPayload,
  hallAtPoint,
  IDLE_STATE,
  pickPingMessage,
  pingGestureReducer,
  PING_MESSAGES,
  type PingGestureState,
} from "./pingGesture";

describe("pingGestureReducer", () => {
  it("starts idle", () => {
    expect(IDLE_STATE).toEqual({ phase: "idle" });
  });

  it("HOLD_START enters holding with the given friend/message and no hover yet", () => {
    const next = pingGestureReducer(IDLE_STATE, { type: "HOLD_START", friendId: "f1", message: "Let's go to…" });
    expect(next).toEqual({ phase: "holding", friendId: "f1", message: "Let's go to…", hoverHallTid: null });
  });

  it("HOVER updates the hovered hall while holding", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: null };
    const next = pingGestureReducer(holding, { type: "HOVER", hallTid: 3 });
    expect(next).toEqual({ phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: 3 });
  });

  it("HOVER can clear back to null (drifted off every hall)", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: 3 };
    const next = pingGestureReducer(holding, { type: "HOVER", hallTid: null });
    expect(next).toEqual({ phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: null });
  });

  it("HOVER while idle is a no-op (ignored, not a crash)", () => {
    const next = pingGestureReducer(IDLE_STATE, { type: "HOVER", hallTid: 2 });
    expect(next).toEqual(IDLE_STATE);
  });

  it("RELEASE always resets to idle", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: 3 };
    expect(pingGestureReducer(holding, { type: "RELEASE" })).toEqual(IDLE_STATE);
  });

  it("CANCEL always resets to idle, even mid-hover", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: 3 };
    expect(pingGestureReducer(holding, { type: "CANCEL" })).toEqual(IDLE_STATE);
  });
});

describe("buildPingPayload", () => {
  it("returns null when idle", () => {
    expect(buildPingPayload(IDLE_STATE)).toBeNull();
  });

  it("returns null when holding but not hovering any hall (release-away cancel)", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Meet me at…", hoverHallTid: null };
    expect(buildPingPayload(holding)).toBeNull();
  });

  it("returns the ping payload when holding and hovering a hall at release", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Meet me at…", hoverHallTid: 4 };
    expect(buildPingPayload(holding)).toEqual({ friendId: "f1", hallTid: 4, message: "Meet me at…" });
  });
});

describe("hallAtPoint", () => {
  const rects = [
    { hallTid: 1, rect: { x: 0, y: 0, width: 100, height: 40 } },
    { hallTid: 2, rect: { x: 0, y: 50, width: 100, height: 40 } },
  ];

  it("returns the hall whose rect contains the point", () => {
    expect(hallAtPoint({ x: 50, y: 20 }, rects)).toBe(1);
    expect(hallAtPoint({ x: 50, y: 70 }, rects)).toBe(2);
  });

  it("returns null when the point is outside every rect (the gap between rows)", () => {
    expect(hallAtPoint({ x: 50, y: 45 }, rects)).toBeNull();
  });

  it("returns null for an empty rect list", () => {
    expect(hallAtPoint({ x: 50, y: 20 }, [])).toBeNull();
  });

  it("treats rect edges as inclusive", () => {
    expect(hallAtPoint({ x: 0, y: 0 }, rects)).toBe(1);
    expect(hallAtPoint({ x: 100, y: 40 }, rects)).toBe(1);
  });
});

describe("pickPingMessage", () => {
  it("has at least 5 messages in the same shuffled-per-hold voice", () => {
    expect(PING_MESSAGES.length).toBeGreaterThanOrEqual(5);
  });

  it("is deterministic under an injected rng: rng()=0 picks the first message", () => {
    expect(pickPingMessage(() => 0)).toBe(PING_MESSAGES[0]);
  });

  it("is deterministic under an injected rng: rng() near 1 picks the last message", () => {
    expect(pickPingMessage(() => 0.9999)).toBe(PING_MESSAGES[PING_MESSAGES.length - 1]);
  });

  it("maps a mid-range rng() to the corresponding index", () => {
    const n = PING_MESSAGES.length;
    const midIndex = Math.floor(0.5 * n);
    expect(pickPingMessage(() => 0.5)).toBe(PING_MESSAGES[midIndex]);
  });
});
