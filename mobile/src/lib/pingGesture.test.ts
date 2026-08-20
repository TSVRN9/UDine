import {
  buildPingPayload,
  hallAtPoint,
  IDLE_STATE,
  pickPingMessage,
  pingGestureReducer,
  pingRow,
  PING_MESSAGES,
  type PingGestureState,
} from "./pingGesture";

describe("pingGestureReducer", () => {
  it("starts idle", () => {
    expect(IDLE_STATE).toEqual({ phase: "idle" });
  });

  it("HOLD_START moves idle -> holding with no hovered hall", () => {
    const next = pingGestureReducer(IDLE_STATE, { type: "HOLD_START", friendId: "f1", message: "Come to…" });
    expect(next).toEqual({ phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: null });
  });

  it("HOVER while holding sets hoverHallTid", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: null };
    const next = pingGestureReducer(holding, { type: "HOVER", hallTid: 3 });
    expect(next).toEqual({ phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: 3 });
  });

  it("HOVER back to null clears the hovered hall", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: 3 };
    const next = pingGestureReducer(holding, { type: "HOVER", hallTid: null });
    expect(next).toEqual({ phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: null });
  });

  it("HOVER while idle is a no-op", () => {
    const next = pingGestureReducer(IDLE_STATE, { type: "HOVER", hallTid: 3 });
    expect(next).toBe(IDLE_STATE);
  });

  it("RELEASE returns to idle", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: 2 };
    expect(pingGestureReducer(holding, { type: "RELEASE" })).toEqual({ phase: "idle" });
  });

  it("CANCEL returns to idle", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: 2 };
    expect(pingGestureReducer(holding, { type: "CANCEL" })).toEqual({ phase: "idle" });
  });

  it("CANCEL while already idle is a no-op", () => {
    expect(pingGestureReducer(IDLE_STATE, { type: "CANCEL" })).toEqual({ phase: "idle" });
  });

  it("a second HOLD_START while already holding overwrites the friend/message (new hold wins)", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: 2 };
    const next = pingGestureReducer(holding, { type: "HOLD_START", friendId: "f2", message: "Swing by…" });
    expect(next).toEqual({ phase: "holding", friendId: "f2", message: "Swing by…", hoverHallTid: null });
  });
});

describe("pickPingMessage", () => {
  it("returns the first message when rng returns 0", () => {
    expect(pickPingMessage(() => 0)).toBe(PING_MESSAGES[0]);
  });

  it("returns the last message when rng returns just under 1", () => {
    expect(pickPingMessage(() => 0.999999)).toBe(PING_MESSAGES[PING_MESSAGES.length - 1]);
  });

  it("returns a middle message for a mid rng value", () => {
    const mid = Math.floor(PING_MESSAGES.length / 2) / PING_MESSAGES.length + 0.01;
    expect(pickPingMessage(() => mid)).toBe(PING_MESSAGES[Math.floor(PING_MESSAGES.length / 2)]);
  });

  it("is deterministic under a fixed rng, not random", () => {
    const a = pickPingMessage(() => 0.5);
    const b = pickPingMessage(() => 0.5);
    expect(a).toBe(b);
  });

  it("has at least 3 messages in a consistent voice (ends with an ellipsis)", () => {
    expect(PING_MESSAGES.length).toBeGreaterThanOrEqual(3);
    for (const m of PING_MESSAGES) expect(m.endsWith("…")).toBe(true);
  });
});

describe("hallAtPoint", () => {
  const rects = [
    { hallTid: 1, rect: { x: 0, y: 0, width: 100, height: 50 } },
    { hallTid: 2, rect: { x: 0, y: 50, width: 100, height: 50 } },
  ];

  it("finds the hall whose rect contains the point", () => {
    expect(hallAtPoint({ x: 10, y: 10 }, rects)).toBe(1);
    expect(hallAtPoint({ x: 10, y: 60 }, rects)).toBe(2);
  });

  it("returns null when the point is outside every rect", () => {
    expect(hallAtPoint({ x: 500, y: 500 }, rects)).toBeNull();
  });

  it("is edge-inclusive (a point exactly on a rect's boundary counts as inside)", () => {
    expect(hallAtPoint({ x: 100, y: 50 }, rects)).toBe(1);
  });

  it("returns null against an empty rect list", () => {
    expect(hallAtPoint({ x: 10, y: 10 }, [])).toBeNull();
  });
});

describe("buildPingPayload", () => {
  it("returns null when idle", () => {
    expect(buildPingPayload(IDLE_STATE)).toBeNull();
  });

  it("returns null when holding but not hovering any hall (release-away cancel)", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: null };
    expect(buildPingPayload(holding)).toBeNull();
  });

  it("builds the payload when holding and hovering a hall", () => {
    const holding: PingGestureState = { phase: "holding", friendId: "f1", message: "Come to…", hoverHallTid: 3 };
    expect(buildPingPayload(holding)).toEqual({ friendId: "f1", hallTid: 3, message: "Come to…" });
  });
});

describe("pingRow", () => {
  it("maps a payload + sender id onto the pings table's exact column names (#93: { message, hall_tid })", () => {
    const payload = { friendId: "friend-1", hallTid: 3, message: "Come to…" };
    expect(pingRow("me", payload)).toEqual({
      sender_id: "me",
      receiver_id: "friend-1",
      hall_tid: 3,
      message: "Come to…",
    });
  });
});
