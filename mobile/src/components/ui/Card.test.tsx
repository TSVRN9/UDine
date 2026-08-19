import renderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";
import { Card } from "./Card";
import { colors } from "../../lib/theme";

function flatten(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));
}

describe("Card", () => {
  it("renders its children", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <Card>
          <Text>Franklin</Text>
        </Card>,
      );
    });
    expect(root.root.findByType(Text).props.children).toBe("Franklin");
  });

  it("uses the paper-50 surface color, mirroring .card", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <Card>
          <Text>content</Text>
        </Card>,
      );
    });
    const style = flatten(root.root.findByType(View).props.style);
    expect(style.backgroundColor).toBe(colors.paper50);
  });
});
