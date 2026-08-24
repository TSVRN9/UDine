import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text } from "react-native";
import { Press } from "./Press";

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
    const tree = root.toJSON() as { type: string; props: { style?: unknown }; children: Array<{ type: string }> };
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
