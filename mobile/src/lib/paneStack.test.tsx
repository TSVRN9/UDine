import { useState } from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";

// Jest hoists jest.mock() above imports and only allows referencing out-of-scope variables whose
// name starts with "mock" inside the factory -- hence the prefix on all three.
const mockMountCount = { current: 0 };
let mockLatestOnSelectPane: ((index: number) => void) | null = null;
let mockLatestActiveIndex = -1;

// #179: PaneHeader must mount exactly once and stay mounted across every pane switch -- a remount
// would restart its internal Animated.Values (title crossfade, dot morph) and desync them from the
// pane transition they're meant to track. Mocked here (not rendered for real) so the assertion is
// about PaneStack's own composition -- header once, outside the per-pane loop -- not about
// PaneHeader's internals, which PaneHeader.tsx's own concerns cover.
jest.mock("../components/PaneHeader", () => {
  const React = require("react");
  return {
    PaneHeader: (props: { activeIndex: number; onSelectPane: (index: number) => void }) => {
      mockLatestOnSelectPane = props.onSelectPane;
      mockLatestActiveIndex = props.activeIndex;
      React.useEffect(() => {
        mockMountCount.current += 1;
      }, []);
      return null;
    },
  };
});

import { PaneStack } from "../components/PaneStack";

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
