// #374: the artboard's shared SectionHeader gap is 10px (HomeOffline.dc.html:111-112,
// Main.dc.html:105-106, Logs.dc.html:66,113,141, EventsPanePress.dc.html:28,45,63); the component
// was rendering spacing(2) = 8px instead.
import renderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";
import { SectionHeader } from "./SectionHeader";
import { colors, withOpacity } from "../../lib/theme";

it("renders the title/rule row with a 10px gap", () => {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<SectionHeader title="For Fun" />);
  });
  const row = root.root.findAllByType(View)[0];
  const style = Array.isArray(row.props.style) ? Object.assign({}, ...row.props.style) : row.props.style;
  expect(style.gap).toBe(10);
});

function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return (style as Record<string, unknown>) ?? {};
}

// #418: YouPaneGrouped.dc.html specifies a second, lighter treatment for three of YouPane's
// sub-headers (Favorites/Your Top Foods/Favorite Halls) -- 12px/1.2-letterspacing title with a
// 1px ink hairline rule, instead of the 13px/1.5/gold-rule default every other call site uses.
describe("SectionHeader variant", () => {
  it("defaults to the 13px/1.5-letterspacing gold-rule treatment when variant is omitted", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<SectionHeader title="Today's Log" />);
    });
    const title = flatStyle(root.root.findByType(Text).props.style);
    expect(title.fontSize).toBe(13);
    expect(title.letterSpacing).toBe(1.5);

    const rule = root.root.findAllByType(View)[1];
    const ruleStyle = flatStyle(rule.props.style);
    expect(ruleStyle.height).toBe(2);
    expect(ruleStyle.backgroundColor).toBe(withOpacity(colors.gold500, 50));
  });

  it('renders the lighter 12px/1.2-letterspacing ink-hairline-rule treatment when variant="subtle"', () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<SectionHeader title="Your Top Foods" variant="subtle" />);
    });
    const title = flatStyle(root.root.findByType(Text).props.style);
    expect(title.fontSize).toBe(12);
    expect(title.letterSpacing).toBe(1.2);

    const rule = root.root.findAllByType(View)[1];
    const ruleStyle = flatStyle(rule.props.style);
    expect(ruleStyle.height).toBe(1);
    expect(ruleStyle.backgroundColor).not.toBe(withOpacity(colors.gold500, 50));
  });
});
