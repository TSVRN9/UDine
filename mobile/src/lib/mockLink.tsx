import React from "react";
import type { ReactNode } from "react";
import { View } from "react-native";

// Shared expo-router `Link` test mock. Every screen test that mocks "expo-router" needs a stand-in
// for `Link` -- the copy-pasted version was `Link: ({ children }) => children`, which silently
// drops `href` (string form, e.g. "/settings", or the object form
// `{ pathname: "/foo", params: {...} }`). That means any test asserting "this Link points at the
// right route" had nothing to actually assert against; the href never reached the rendered tree.
// This mock renders `href` as a reachable prop on a real RN host component instead (a bare custom
// tag name isn't a valid host component under the RN test renderer), so
// `root.findByProps({ href: ... })` can verify it.
export function mockLink({ children, href }: { children?: ReactNode; href?: unknown }) {
  return React.createElement(View, { href } as never, children);
}
