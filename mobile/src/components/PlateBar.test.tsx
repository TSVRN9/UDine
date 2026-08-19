// Explicit factory, not the real provider: react-native-safe-area-context's SafeAreaProvider only
// resolves insets once its native view fires an onInsetsChange event, which never happens under
// react-test-renderer -- children stay stuck unrendered. Stubbing the hook directly is the
// documented workaround and keeps this a focused PlateBar test, not a provider-plumbing test.
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { PlateBar } from "./PlateBar";

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
    expect(body).toMatch(/LOG/);
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
});
