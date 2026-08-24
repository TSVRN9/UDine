import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { Press } from "./Press";

// #179 review: Press originally applied the caller's `style` to the *inner* Animated.View, not
// the Pressable itself. Layout-only style props (flex, margin, explicit width/height,
// alignItems/justifyContent used for centering -- e.g. Button.tsx's `exportButton: { flex: 1 }`
// and PaneHeader's `dotTapTarget`) only take effect on a node that's an actual flex participant
// in its parent; an auto-sized inner child silently ignores them. Pin the fix: the style caller
// passes in must land on the real Pressable, so RN's layout engine sees it.
describe("Press", () => {
  it("puts the caller's style on the outer Pressable, not the inner animated wrapper", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(
        <Press style={{ flex: 1 }}>
          <Text>tap me</Text>
        </Press>,
      );
    });
    // toJSON() walks the actual rendered *host* tree (real "View" nodes), not React component
    // identity -- Pressable is a forwardRef/context wrapper that findByType can't locate directly
    // under jest-expo's RN mock, so the host tree is the reliable thing to assert on.
    const tree = root.toJSON() as { type: string; props: { style?: object }; children: unknown[] };
    expect(tree.type).toBe("View");
    expect(tree.props.style).toMatchObject({ flex: 1 });

    // The inner wrapper (the thing that actually carries the scale transform) must NOT also carry
    // the caller's layout style -- that's the exact duplication/misplacement this test guards
    // against (an inner `flex: 1` would have masked the underlying bug rather than fixing it).
    const inner = tree.children[0] as { props: { style?: { flex?: number } } };
    expect(inner.props.style).not.toHaveProperty("flex");
  });
});
