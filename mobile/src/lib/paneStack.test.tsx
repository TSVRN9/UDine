import { useState } from "react";
import { Animated, Text, View } from "react-native";
import renderer, { act } from "react-test-renderer";

import { PaneStack } from "../components/PaneStack";

// Jest hoists jest.mock() above imports and only allows referencing out-of-scope variables whose
// name starts with "mock" inside the factory -- hence the prefix on all three.
const mockMountCount = { current: 0 };
let mockLatestOnSelectPane: ((index: number) => void) | null = null;
let mockLatestActiveIndex = -1;
// #245: captured so gesture tests can read the SAME Animated.Value instances PaneStack drives via
// onPanResponderMove/settlePosition -- proves the wiring reaches PaneHeader's shared title tracking,
// not just the pure paneDragPosition helper.
let mockLatestTitlePos: Animated.Value | null = null;
let mockLatestTitleOpacityPos: Animated.Value | null = null;

// #179: PaneHeader must mount exactly once and stay mounted across every pane switch -- a remount
// would restart its internal Animated.Values (title crossfade, dot morph) and desync them from the
// pane transition they're meant to track. Mocked here (not rendered for real) so the assertion is
// about PaneStack's own composition -- header once, outside the per-pane loop -- not about
// PaneHeader's internals, which PaneHeader.tsx's own concerns cover.
jest.mock("../components/PaneHeader", () => {
  const React = require("react");
  return {
    PaneHeader: (props: {
      activeIndex: number;
      onSelectPane: (index: number) => void;
      titlePos?: Animated.Value;
      titleOpacityPos?: Animated.Value;
    }) => {
      mockLatestOnSelectPane = props.onSelectPane;
      mockLatestActiveIndex = props.activeIndex;
      mockLatestTitlePos = props.titlePos ?? null;
      mockLatestTitleOpacityPos = props.titleOpacityPos ?? null;
      React.useEffect(() => {
        mockMountCount.current += 1;
      }, []);
      return null;
    },
  };
});

function Pane({ label }: { label: string }) {
  return <Text>{label}</Text>;
}

function Harness() {
  const [index, setIndex] = useState(1);
  return (
    <PaneStack
      activeIndex={index}
      onActiveIndexChange={setIndex}
      topInset={0}
      panes={[<Pane key="s" label="Social" />, <Pane key="h" label="Home" />, <Pane key="y" label="You" />]}
    />
  );
}

beforeEach(() => {
  mockMountCount.current = 0;
  mockLatestOnSelectPane = null;
  mockLatestActiveIndex = -1;
  mockLatestTitlePos = null;
  mockLatestTitleOpacityPos = null;
});

// A single-touch PanResponder move/grant event. `dx` for a move is `currentPageX - previousPageX`
// of the SAME event (RN's PanResponder accumulates gestureState.dx from that per-event delta, not
// from diffing across separate calls) -- so a move's own prev/curr pair IS the gesture's step, and
// grant's pageX value is irrelevant (PaneStack's onPanResponderGrant reads no gesture fields).
function fakeTouch(previousPageX: number, currentPageX: number, timeStamp: number) {
  return {
    nativeEvent: { touches: [{}], changedTouches: [{}], timestamp: timeStamp },
    touchHistory: {
      touchBank: [{ touchActive: true, currentTimeStamp: timeStamp, currentPageX, currentPageY: 0, previousPageX, previousPageY: 0 }],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timeStamp,
    },
     
  } as any;
}

// `__getValue()` is RN's own internal-but-stable way to read an Animated.Value synchronously
// (used by every native driver); it's just not in the public .d.ts, hence the cast.
function readAnimatedValue(value: Animated.Value): number {
  return (value as unknown as { __getValue(): number }).__getValue();
}

describe("PaneStack swipe gesture wiring (#245 item 2)", () => {
  // Renders with activeIndex=1 (Home) and returns the responder handlers spread onto the root
  // View by `{...panResponder.panHandlers}` -- same lookup strategy SocialPane.test.tsx uses for
  // its own PanResponder-driven gesture (find by the onResponderGrant prop RN actually attaches,
  // not by style/testID).
  function renderGestureHarness(onActiveIndexChange: (index: number) => void) {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PaneStack
          activeIndex={1}
          onActiveIndexChange={onActiveIndexChange}
          topInset={0}
          panes={[<Pane key="s" label="Social" />, <Pane key="h" label="Home" />, <Pane key="y" label="You" />]}
        />,
      );
    });
    const candidates = root.root.findAllByType(View).filter((n) => typeof n.props.onResponderGrant === "function");
    expect(candidates.length).toBe(1);
    return candidates[0].props as {
      onResponderGrant: (e: unknown) => void;
      onResponderMove: (e: unknown) => void;
      onResponderRelease: (e: unknown) => void;
      onResponderTerminate: (e: unknown) => void;
    };
  }

  it("(b) onPanResponderGrant stops any in-flight settle animation before a new drag starts", () => {
    const handlers = renderGestureHarness(() => {});
    expect(mockLatestTitlePos).not.toBeNull();
    const stopSpy = jest.spyOn(mockLatestTitlePos!, "stopAnimation");
    const stopOpacitySpy = jest.spyOn(mockLatestTitleOpacityPos!, "stopAnimation");

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });

    expect(stopSpy).toHaveBeenCalled();
    expect(stopOpacitySpy).toHaveBeenCalled();
  });

  it("(a) onPanResponderMove drives the shared position continuously across two in-flight moves, well before any commit", () => {
    const onActiveIndexChange = jest.fn();
    const handlers = renderGestureHarness(onActiveIndexChange);

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      // Finger moves left 30px: dx=-30 -> paneDragPosition(1, -30) = 1 - (-30/60) = 1.5.
      handlers.onResponderMove(fakeTouch(0, -30, 2));
    });
    expect(readAnimatedValue(mockLatestTitlePos!)).toBeCloseTo(1.5);
    expect(onActiveIndexChange).not.toHaveBeenCalled();

    act(() => {
      // Finger continues to -45px total: dx accumulates to -45 -> paneDragPosition(1, -45) = 1.75.
      handlers.onResponderMove(fakeTouch(-30, -45, 3));
    });
    expect(readAnimatedValue(mockLatestTitlePos!)).toBeCloseTo(1.75);
    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });

  it("(c) release below SWIPE_COMMIT_PX settles back to the drag-start index", () => {
    const onActiveIndexChange = jest.fn();
    const handlers = renderGestureHarness(onActiveIndexChange);
    const timingSpy = jest.spyOn(Animated, "timing");

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -45, 2)); // dx=-45, below the 60px commit threshold
    });
    const callsBeforeRelease = timingSpy.mock.calls.length;
    act(() => {
      handlers.onResponderRelease(fakeTouch(-45, -45, 3));
    });

    expect(onActiveIndexChange).not.toHaveBeenCalled();
    const settleCalls = timingSpy.mock.calls.slice(callsBeforeRelease);
    expect(settleCalls.length).toBeGreaterThan(0);
    for (const [, config] of settleCalls) {
      expect((config as { toValue: number }).toValue).toBe(1); // dragStartIndex, not a new commit
    }
  });

  it("(c) release above SWIPE_COMMIT_PX commits to the neighboring pane", () => {
    const onActiveIndexChange = jest.fn();
    const handlers = renderGestureHarness(onActiveIndexChange);
    const timingSpy = jest.spyOn(Animated, "timing");

    act(() => {
      handlers.onResponderGrant(fakeTouch(0, 0, 1));
    });
    act(() => {
      handlers.onResponderMove(fakeTouch(0, -80, 2)); // dx=-80, past the 60px commit threshold
    });
    const callsBeforeRelease = timingSpy.mock.calls.length;
    act(() => {
      handlers.onResponderRelease(fakeTouch(-80, -80, 3));
    });

    expect(onActiveIndexChange).toHaveBeenCalledWith(2); // negative dx commits to the next pane
    const settleCalls = timingSpy.mock.calls.slice(callsBeforeRelease);
    expect(settleCalls.length).toBeGreaterThan(0);
    for (const [, config] of settleCalls) {
      expect((config as { toValue: number }).toValue).toBe(2);
    }
  });
});

describe("PaneStack", () => {
  it("mounts PaneHeader exactly once and keeps it mounted across every pane switch", async () => {
    await act(async () => {
      renderer.create(<Harness />);
    });
    expect(mockMountCount.current).toBe(1);

    for (const target of [0, 2, 1, 0, 2]) {
      await act(async () => {
        mockLatestOnSelectPane?.(target);
      });
    }

    expect(mockMountCount.current).toBe(1);
  });

  it("passes the current activeIndex through to the header (drives its dot active-state)", async () => {
    await act(async () => {
      renderer.create(
        <PaneStack
          activeIndex={2}
          onActiveIndexChange={() => {}}
          topInset={0}
          panes={[<Pane key="s" label="Social" />, <Pane key="h" label="Home" />, <Pane key="y" label="You" />]}
        />,
      );
    });
    expect(mockLatestActiveIndex).toBe(2);
  });

  it("gives only the active pane live touches, per paneVisibility", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<Harness />);
    });
    const socialText = root.root.findByProps({ children: "Social" });
    const homeText = root.root.findByProps({ children: "Home" });
    // Walk up to each pane's Animated.View wrapper (the direct View ancestor carrying pointerEvents).
    function pointerEventsOf(node: renderer.ReactTestInstance): unknown {
      let n: renderer.ReactTestInstance | null = node;
      while (n) {
        if (n.props.pointerEvents !== undefined) return n.props.pointerEvents;
        n = n.parent;
      }
      return undefined;
    }
    expect(pointerEventsOf(homeText)).toBe("auto"); // HOME_PANE_INDEX starts active
    expect(pointerEventsOf(socialText)).toBe("none");
  });
});
