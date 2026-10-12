import { act } from "react";
import { StyleSheet, Text } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { PushPage } from "./PushPage";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));

const page = (p: number) => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<PushPage title="Dietary preferences" onPop={() => {}} progress={{ get: () => p, set: () => {} } as never}><Text>body</Text></PushPage>); });
  return r;
};
const shadow = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && n.props.style && StyleSheet.flatten(n.props.style).boxShadow !== undefined).map((n) => StyleSheet.flatten(n.props.style).boxShadow);

describe("a pushed page's shadow", () => {
  it("is cast while the page moves", () => expect(shadow(page(0.4))[0]).toHaveLength(m2.shadow.push.length));
  it("is gone once the page is in", () => expect(shadow(page(0))[0]).toEqual([]));
});
