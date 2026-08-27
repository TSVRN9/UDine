import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text } from "react-native";
import { Press, PressDim } from "./Press";

// #179 review, round 2: Press first applied the caller's `style` to the *inner* Animated.View
// instead of the Pressable -- box properties (flex/margin/width/height) landed on the wrong node.
// Fixing that by moving `style` to the Pressable and leaving a separate inner wrapper for the
// scale transform introduced a DIFFERENT bug: an *arrangement* style over multiple children
// (flexDirection/gap/alignItems -- e.g. YouPane's `allLogsLink: { flexDirection: "row" }` around
// two Texts) then governed the Pressable's one real child (that inner wrapper), not the actual
// content -- caught on-device as "ALL LOGS ›" rendering as two stacked lines instead of one row.
// The real fix collapses to a single node (Animated.createAnimatedComponent(Pressable)): no inner
// wrapper for an arrangement style to be misdirected onto in the first place.
describe("Press", () => {
  it("renders children directly under the Pressable -- no intermediate wrapper node", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(
        <Press style={{ flexDirection: "row" }}>
          <Text>ALL LOGS</Text>
          <Text>{"›"}</Text>
        </Press>,
      );
    });
    // toJSON() walks the actual rendered *host* tree (real "View"/"Text" nodes), not React
    // component identity -- Pressable is a forwardRef/context wrapper that findByType can't
    // locate directly under jest-expo's RN mock, so the host tree is the reliable thing to assert
    // on. Both Texts must be direct children of the host View -- if an inner wrapper reappears,
    // this fails the same way the real "ALL LOGS" bug did (a row style stops reaching them).
    const tree = root.toJSON() as { type: string; props: { style?: unknown }; children: { type: string }[] };
    expect(tree.type).toBe("View");
    expect(tree.children).toHaveLength(2);
    expect(tree.children.every((c) => c.type === "Text")).toBe(true);
  });

  it("carries both the caller's style and the press-scale transform on that same host node", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(
        <Press style={{ flex: 1 }}>
          <Text>tap me</Text>
        </Press>,
      );
    });
    const tree = root.toJSON() as { props: { style?: unknown } };
    // style is the array RN passes through (`[callerStyle, { transform }]`) -- flatten it rather
    // than assume either RN or the test renderer merges it, so this doesn't depend on that detail.
    const flat = StyleSheet.flatten(tree.props.style as never) as { flex?: number; transform?: unknown };
    expect(flat.flex).toBe(1);
    expect(flat.transform).toEqual([{ scale: 1 }]);
  });
});

// #179 review: nothing in this suite (or anywhere else in the tree) referenced PressDim,
// 0.18, or "brightness" before this -- PressDim could be rewritten to scale
// like Press instead, with its dim overlay deleted entirely, and the rest of the suite would stay
// green. That's exactly the thing the styling spec says NEVER to do for a `.pressd` zone (hall-card
// header zones, grab-n-go strips): scaling shrinks the strip inside its parent card and breaks the
// one-cohesive-card illusion. Pins both halves of the contract: the Pressable itself never carries
// a transform, and the dim is a real black overlay layered after the content.
describe("PressDim", () => {
  it("never scales, and dims via a trailing black overlay instead of a transform", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(
        <PressDim>
          <Text>GRAB &apos;N GO</Text>
        </PressDim>,
      );
    });
    const tree = root.toJSON() as {
      props: { style?: unknown };
      children: { type: string; props: { style?: unknown } }[];
    };

    const flat = (StyleSheet.flatten(tree.props.style as never) ?? {}) as { transform?: unknown };
    expect(flat.transform).toBeUndefined();

    // The overlay is appended after the caller's children -- last child, not first.
    const overlay = tree.children[tree.children.length - 1];
    const overlayStyle = StyleSheet.flatten(overlay.props.style as never) as { backgroundColor?: string };
    expect(overlayStyle.backgroundColor).toBe("#000");
  });
});
