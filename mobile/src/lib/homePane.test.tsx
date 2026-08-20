import type { ReactNode } from "react";

// Same rationale as FirstRunCard.test.tsx: explicit factories, not bare automocks -- automock still
// imports the real module to derive its shape, and the real ../lib/supabase / ../lib/firstRun both
// drag in native bindings (AsyncStorage, the Supabase client's url/key validation) unavailable
// outside jest-expo's native harness.
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

jest.mock("../lib/auth", () => ({
  signInWithGoogle: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("../lib/firstRun", () => ({
  isFirstRunDismissed: jest.fn().mockResolvedValue(false),
  dismissFirstRun: jest.fn(),
}));

// HomePane always renders Links (hall cards, quick links) -- stub them out flat since there's no
// navigator in this render tree.
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  useFocusEffect: (_callback: () => void) => {},
}));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { HomePane } from "../app/index";

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

describe("HomePane", () => {
  // #104 review blocker 2: the old home screen mounted FirstRunCard (first-run onboarding, #68);
  // it got dropped when #90's pane shell replaced that screen, leaving the no-account/
  // data-never-leaves-device messaging dead code.
  it("mounts the first-run onboarding card", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane activeIndex={1} />);
    });

    const body = texts(root).join(" ");
    expect(body).toMatch(/Welcome to UDine/);
    expect(body).toMatch(/never leaves this device/);
  });
});
