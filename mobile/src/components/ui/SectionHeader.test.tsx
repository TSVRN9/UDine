// #374: the artboard's shared SectionHeader gap is 10px (HomeOffline.dc.html:111-112,
// Main.dc.html:105-106, Logs.dc.html:66,113,141, EventsPanePress.dc.html:28,45,63); the component
// was rendering spacing(2) = 8px instead.
import renderer, { act } from "react-test-renderer";
import { View } from "react-native";
import { SectionHeader } from "./SectionHeader";

it("renders the title/rule row with a 10px gap", () => {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<SectionHeader title="For Fun" />);
  });
  const row = root.root.findAllByType(View)[0];
  const style = Array.isArray(row.props.style) ? Object.assign({}, ...row.props.style) : row.props.style;
  expect(style.gap).toBe(10);
});
