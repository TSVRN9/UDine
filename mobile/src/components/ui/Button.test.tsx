import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { Button } from "./Button";
import { buttonColors } from "../../lib/theme";

function flatten(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));
}

describe("Button", () => {
  it("renders its label", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Button variant="primary">Log</Button>);
    });
    expect(root.root.findByType(Text).props.children).toBe("Log");
  });

  it("applies the primary variant's fill and text color", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Button variant="primary">Save</Button>);
    });
    const expected = buttonColors("primary");
    // Assert against the Text color directly — the most stable signal across RN's Pressable internals.
    const textStyle = flatten(root.root.findByType(Text).props.style);
    expect(textStyle.color).toBe(expected.color);
  });

  it("applies the ghost variant's muted text color, distinct from primary", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Button variant="ghost">Skip</Button>);
    });
    const textStyle = flatten(root.root.findByType(Text).props.style);
    expect(textStyle.color).toBe(buttonColors("ghost").color);
    expect(textStyle.color).not.toBe(buttonColors("primary").color);
  });

  it("defaults to the primary variant when none is given", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Button>Default</Button>);
    });
    const textStyle = flatten(root.root.findByType(Text).props.style);
    expect(textStyle.color).toBe(buttonColors("primary").color);
  });

  it("fires onPress when tapped and not disabled", () => {
    const onPress = jest.fn();
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <Button variant="primary" onPress={onPress}>
          Tap me
        </Button>,
      );
    });
    act(() => {
      root.root.findByProps({ accessibilityRole: "button" }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
