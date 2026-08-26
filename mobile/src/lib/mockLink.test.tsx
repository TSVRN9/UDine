import renderer, { act } from "react-test-renderer";
import { mockLink } from "./mockLink";

// Pins #251: the shared expo-router `Link` test mock must keep `href` reachable on the rendered
// element, string or object form, instead of the old `({ children }) => children` stub that
// discarded it. Red against that old stub -- `root.findByProps({ href })` would throw
// "No instances found" because no node ever carried an `href` prop.
describe("mockLink", () => {
  it("keeps a string href reachable on the rendered element", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(mockLink({ children: "Settings", href: "/settings" }));
    });
    expect(root.root.findByProps({ href: "/settings" })).toBeTruthy();
  });

  it("keeps an object-form href reachable on the rendered element", () => {
    const href = { pathname: "/friend/[id]", params: { id: "abc" } };
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(mockLink({ children: "Friend", href }));
    });
    expect(root.root.findByProps({ href })).toBeTruthy();
  });
});
