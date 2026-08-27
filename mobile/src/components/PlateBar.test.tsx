// Explicit factory, not the real provider: react-native-safe-area-context's SafeAreaProvider only
// resolves insets once its native view fires an onInsetsChange event, which never happens under
// react-test-renderer -- children stay stuck unrendered. Stubbing the hook directly is the
// documented workaround and keeps this a focused PlateBar test, not a provider-plumbing test.
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { PlateBar } from "./PlateBar";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

describe("PlateBar", () => {
  it("renders the item count, calorie total, and macro line", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PlateBar itemCount={3} totals={{ date: "x", calories: 640, proteinG: 30, totalCarbG: 70, totalFatG: 20 }} onPress={() => {}} />,
      );
    });

    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/3\s+items\s+·\s+640\s+cal/);
    expect(body).toMatch(/30\s*g protein/);
    expect(body).toMatch(/Log/i);
  });

  it("calls onPress when tapped", () => {
    const onPress = jest.fn();
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PlateBar itemCount={1} totals={{ date: "x", calories: 100, proteinG: 1, totalCarbG: 1, totalFatG: 1 }} onPress={onPress} />,
      );
    });
    act(() => {
      root.root.findByProps({ accessibilityRole: "button" }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // #181: loading/error empty-plate variant.
  it("shows the empty-plate variant (not the real summary) when itemCount is 0 and emptyState is set", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PlateBar
          itemCount={0}
          totals={{ date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 }}
          onPress={() => {}}
          emptyState={{ subline: "add dishes once the menu loads", disabled: true }}
        />,
      );
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Plate is empty/);
    expect(body).toMatch(/add dishes once the menu loads/);
    expect(body).not.toMatch(/0 items/);
  });

  it("shows the normal functional bar even during emptyState if the plate already has real items", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PlateBar
          itemCount={2}
          totals={{ date: "x", calories: 300, proteinG: 10, totalCarbG: 10, totalFatG: 10 }}
          onPress={() => {}}
          emptyState={{ subline: "add dishes once the menu loads", disabled: true }}
        />,
      );
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/2\s+items/);
    expect(body).not.toMatch(/Plate is empty/);
  });
});
