import { act } from "react";
import renderer from "react-test-renderer";
import { YouScreen } from "./YouScreen";
import { PushPage } from "./PushPage";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));

const words = (n: renderer.ReactTestInstance) => n.findAll((x) => (x.type as unknown) === "Text").map((x) => [x.props.children].flat().join("")).join(" ");
const open = () => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<YouScreen />); });
  const row = r.root.findAll((x) => typeof x.type !== "string" && typeof x.props.onPress === "function" && words(x).startsWith("Dietary preferences"))[0];
  act(() => { row.props.onPress(); });
  return r;
};

// M2 `navPush` for a You row: the screen below shifts left 30% and dims to 10% as the page comes in (MO.push)
describe("Dietary preferences is pushed over You", () => {
  it("hands the page the push it shifts and dims You by", () => {
    const r = open();
    expect(r.root.findByType(PushPage).props.progress).toBeDefined();
  });
  it("draws You's dim under the page", () => {
    const r = open();
    expect(r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "push-dim")).toHaveLength(1);
  });
});
