import { Component, type ReactNode } from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { ErrorBoundary } from "../app/_layout";

// #271: there was no ErrorBoundary anywhere in the app -- no route exported one, so an uncaught
// render error anywhere was an unrecoverable RN fatal in release (see _layout.tsx's own comment
// for why exporting `ErrorBoundary` here actually gives the whole app a root boundary, not just
// this layout's own render).
//
// expo-router's own `Try` component (the thing that actually catches the error and renders this
// export as the fallback) isn't part of its public API -- see
// node_modules/expo-router/build/exports.d.ts, which exports `ErrorBoundary` and
// `ErrorBoundaryProps` but not `Try` itself. This stand-in mirrors `Try`'s real implementation
// (node_modules/expo-router/build/views/Try.js) byte-for-byte in shape -- same
// getDerivedStateFromError, same retry (resolve a promise after clearing the error state) -- so
// the test below exercises the real integration (a React error boundary catching a throwing
// descendant and rendering this app's ErrorBoundary export), not just the presentational
// component in isolation.
class TestTry extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = { error: undefined };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  retry = () => new Promise<void>((resolve) => this.setState({ error: undefined }, resolve));
  render() {
    if (this.state.error) return <ErrorBoundary error={this.state.error} retry={this.retry} />;
    return this.props.children;
  }
}

function texts(root: renderer.ReactTestRenderer): string {
  return root.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children)))
    .join(" | ");
}

describe("_layout's ErrorBoundary export", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // React logs the caught render error to console.error as part of its own error-boundary
    // machinery -- expected noise for these tests, not a real assertion target.
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders the fallback UI instead of crashing when a descendant throws", () => {
    function Bomb(): null {
      throw new Error("kaboom");
    }
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <TestTry>
          <Bomb />
        </TestTry>,
      );
    });
    expect(texts(root)).toMatch(/Something went wrong/);
    expect(texts(root)).toMatch(/kaboom/);
  });

  it("recovers and re-renders children after retry is pressed", async () => {
    let shouldThrow = true;
    function MaybeBomb() {
      if (shouldThrow) throw new Error("kaboom");
      return <Text>recovered</Text>;
    }
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <TestTry>
          <MaybeBomb />
        </TestTry>,
      );
    });
    expect(texts(root)).toMatch(/Something went wrong/);

    shouldThrow = false;
    const button = root.root.findByProps({ accessibilityRole: "button" });
    act(() => {
      button.props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(texts(root)).toMatch(/recovered/);
  });
});
