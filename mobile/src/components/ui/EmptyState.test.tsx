import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the title and an optional message", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<EmptyState title="No favorites yet" message="Star a dish to add one." />);
    });
    const texts = root.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain("No favorites yet");
    expect(texts).toContain("Star a dish to add one.");
  });

  it("renders an optional action node below the message", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<EmptyState title="Nothing logged" action={<Text>Find something to eat</Text>} />);
    });
    expect(root.root.findAllByType(Text).map((n) => n.props.children)).toContain("Find something to eat");
  });
});
