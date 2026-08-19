// Explicit factory, not a bare jest.mock() automock: an automock still requires the real module to
// derive its shape, which drags in @react-native-async-storage/async-storage's native binding --
// unavailable/unmocked outside jest-expo's native harness, so it throws before this file even runs.
jest.mock("../lib/firstRun", () => ({
  isFirstRunDismissed: jest.fn(),
  dismissFirstRun: jest.fn(),
}));

import renderer, { act } from "react-test-renderer";
import { Pressable, Text } from "react-native";
import { FirstRunCard } from "./FirstRunCard";
import * as firstRun from "../lib/firstRun";

const mockedFirstRun = firstRun as jest.Mocked<typeof firstRun>;

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

describe("FirstRunCard", () => {
  beforeEach(() => {
    mockedFirstRun.dismissFirstRun.mockResolvedValue(undefined);
  });

  it("renders nothing once the flag is already dismissed", async () => {
    mockedFirstRun.isFirstRunDismissed.mockResolvedValue(true);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<FirstRunCard />);
    });
    expect(root.root.findAllByType(Text)).toHaveLength(0);
  });

  it("states device-only data, the export path, and what sign-in adds when not yet dismissed", async () => {
    mockedFirstRun.isFirstRunDismissed.mockResolvedValue(false);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<FirstRunCard />);
    });

    const body = texts(root).join(" ");
    expect(body).toMatch(/never leaves this device/);
    expect(body).toMatch(/Export/);
    expect(body).toMatch(/friends/);
    expect(body).toMatch(/pings/);
    expect(body).toMatch(/cross-device favorites/);
    expect(body).toMatch(/push/);
  });

  it("calls dismissFirstRun and hides itself when dismissed", async () => {
    mockedFirstRun.isFirstRunDismissed.mockResolvedValue(false);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<FirstRunCard />);
    });

    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Dismiss welcome message" }).props.onPress();
    });

    expect(mockedFirstRun.dismissFirstRun).toHaveBeenCalledTimes(1);
    expect(root.root.findAllByType(Pressable)).toHaveLength(0);
  });
});
