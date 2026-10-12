import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { Layers } from "./Header";

// the host views that carry accessibility props, with the text inside each
const hosts = (r: renderer.ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && n.props.importantForAccessibility === "no-hide-descendants");

it("the old labels' layer is hidden from accessibility and takes no touches; the new one is not", () => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<Layers now={<Text>Fri 9</Text>} was={<Text>Today</Text>} />); });
  const hidden = hosts(r);
  expect(hidden).toHaveLength(1);
  expect(hidden[0].props.accessibilityElementsHidden).toBe(true);
  expect(hidden[0].props.pointerEvents).toBe("none");
  expect(hidden[0].findAllByType(Text).map((t) => t.props.children)).toEqual(["Today"]);
});
