import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its label text", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Badge>Favorite</Badge>);
    });
    expect(root.root.findByType(Text).props.children).toBe("Favorite");
  });
});
