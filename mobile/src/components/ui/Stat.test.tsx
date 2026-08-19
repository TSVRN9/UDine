import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { Stat } from "./Stat";

describe("Stat", () => {
  it("renders the label and value", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Stat label="Calories" value="1850" />);
    });
    const texts = root.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain("Calories");
    expect(texts).toContain("1850");
  });

  it("renders an optional caption, and omits it when not given", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Stat label="Protein" value="80g" caption="42% of calories" />);
    });
    expect(root.root.findAllByType(Text).map((n) => n.props.children)).toContain("42% of calories");

    act(() => {
      root = renderer.create(<Stat label="Protein" value="80g" />);
    });
    expect(root.root.findAllByType(Text)).toHaveLength(2);
  });
});
