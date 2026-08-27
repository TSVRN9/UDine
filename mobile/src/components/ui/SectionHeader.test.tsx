// #245 item 4 known nit: the artboard's shared SectionHeader gap is 8px; this screen (and every
// other SectionHeader call site) was rendering spacing(2.5) = 10px instead.
import renderer, { act } from "react-test-renderer";
import { View } from "react-native";
import { SectionHeader } from "./SectionHeader";

it("renders the title/rule row with an 8px gap", () => {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<SectionHeader title="For Fun" />);
  });
  const row = root.root.findAllByType(View)[0];
  const style = Array.isArray(row.props.style) ? Object.assign({}, ...row.props.style) : row.props.style;
  expect(style.gap).toBe(8);
});
