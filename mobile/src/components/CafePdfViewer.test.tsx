// CafePdfViewer had ZERO tests (PR #219 review, finding 4) despite being the one screen that loads
// third-party PDF bytes into a WebView -- exactly the surface finding 3's lockdown (vendored pdf.js,
// no CDN script src, originWhitelist/onShouldStartLoadWithRequest/allowFileAccess/
// setSupportMultipleWindows) protects. This pins those security-critical props directly, plus that
// the generated viewer HTML references the vendored LOCAL asset, never a remote host.

// WebView needs a native module not present under jest. Mocked as a jest.fn (not `() => null`) so
// this file can inspect exactly what props it was rendered with -- the point of this test.
import fs from "node:fs";
import path from "node:path";
import { StyleSheet } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import renderer, { act } from "react-test-renderer";
import { CafePdfViewer, shouldAllowCafePdfNavigation } from "./CafePdfViewer";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { spacing } from "../lib/theme";

// CafePdfViewer reads safe-area insets; no SafeAreaProvider in this render tree (same fix as
// CustomFoodForm.test.tsx/NutritionLabel.test.tsx). A jest.fn (not a fixed object) so the bottom-
// inset test below can override it per-render.
const mockUseSafeAreaInsets = jest.fn(() => ({ top: 0, right: 0, bottom: 0, left: 0 }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
}));

interface CapturedWebViewProps {
  source: { html: string };
  originWhitelist: string[];
  allowFileAccess: boolean;
  setSupportMultipleWindows: boolean;
}
const mockWebView = jest.fn((_props: CapturedWebViewProps) => null);
jest.mock("react-native-webview", () => ({
  WebView: (props: CapturedWebViewProps) => mockWebView(props),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn(),
}));

// #325: the vendored pdf.js scripts now ship as expo-asset bundled assets (mobile/src/vendor/*.txt)
// instead of base64 JS string constants -- resolved via Asset.fromModule(...).downloadAsync(), then
// read back off disk. Both vendor files resolve to the SAME numeric module id under jest
// (jest-expo's asset transform always emits `module.exports = 1` regardless of filename -- see
// mobile/jest.config.js), so this mock can't branch on the id the way the real Metro bundler could.
// What's actually deterministic is call ORDER: CafePdfViewer's buildViewerHtml always resolves
// loadPdfjsMinJsBase64() before loadPdfjsWorkerMinJsBase64() (Promise.all evaluates array elements
// in argument order), so the first Asset.fromModule call of a render is always the min.js asset and
// the second is always the worker.
const VENDOR_PDFJS_MIN_LOCAL_URI = "file:///vendor-assets/pdf.min.js.txt";
const VENDOR_PDFJS_WORKER_LOCAL_URI = "file:///vendor-assets/pdf.worker.min.js.txt";
const FAKE_PDFJS_MIN_BASE64 = "RkFLRV9QREZKU19NSU5fSlM="; // base64("FAKE_PDFJS_MIN_JS")
const FAKE_PDFJS_WORKER_BASE64 = "RkFLRV9QREZKU19XT1JLRVJfSlM="; // base64("FAKE_PDFJS_WORKER_JS")

const mockAssetDownloadAsync = jest.fn().mockResolvedValue(undefined);
const mockAssetFromModule = jest.fn((_moduleId: number): { downloadAsync: typeof mockAssetDownloadAsync; localUri: string } => {
  const localUri: string = mockAssetFromModule.mock.calls.length % 2 === 1 ? VENDOR_PDFJS_MIN_LOCAL_URI : VENDOR_PDFJS_WORKER_LOCAL_URI;
  return { downloadAsync: mockAssetDownloadAsync, localUri };
});
jest.mock("expo-asset", () => ({
  Asset: { fromModule: (moduleId: number) => mockAssetFromModule(moduleId) },
}));

const mockDownloadAsync = jest.fn().mockResolvedValue({ status: 200 });
const mockReadAsStringAsync = jest.fn((uri: string): Promise<string> => {
  if (uri === VENDOR_PDFJS_MIN_LOCAL_URI) return Promise.resolve(FAKE_PDFJS_MIN_BASE64);
  if (uri === VENDOR_PDFJS_WORKER_LOCAL_URI) return Promise.resolve(FAKE_PDFJS_WORKER_BASE64);
  return Promise.resolve("ZmFrZS1wZGYtYnl0ZXM="); // base64("fake-pdf-bytes") -- the downloaded PDF's own bytes
});
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  downloadAsync: (...args: [string, string]) => mockDownloadAsync(...args),
  readAsStringAsync: (uri: string) => mockReadAsStringAsync(uri),
  EncodingType: { Base64: "base64" },
}));

function loadRequest(url: string): ShouldStartLoadRequest {
  // Only `url` is read by shouldAllowCafePdfNavigation -- the rest of ShouldStartLoadRequest's
  // fields (navigationType, canGoBack, ...) aren't relevant to this predicate.
  return { url } as ShouldStartLoadRequest;
}

async function renderViewer() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<CafePdfViewer url="https://umassdining.com/menu.pdf" label="Fall Menu" cafeName="Baby Berk" onClose={jest.fn()} />);
  });
  return root;
}

function lastWebViewProps(): CapturedWebViewProps {
  const call = mockWebView.mock.calls.at(-1);
  if (!call) throw new Error("WebView was never rendered");
  return call[0];
}

describe("#325: vendored pdf.js ships as expo-asset bundled assets, not inline base64 constants", () => {
  it("pdfjs.ts has no giant inline string literal -- the old base64-JS-constant approach re-shipped ~1.88MB on every OTA update regardless of whether the update touched PDF viewing", () => {
    // A plain file-size check, not a string-literal scan -- robust to quote style (template
    // literal, single, double) and doesn't build an array of giant matches to Math.max over.
    const { size } = fs.statSync(path.join(__dirname, "../vendor/pdfjs.ts"));
    expect(size).toBeLessThan(10_000);
  });

  it("resolves both vendored scripts via expo-asset's Asset.fromModule + downloadAsync, not a hardcoded constant", async () => {
    await renderViewer();
    expect(mockAssetFromModule).toHaveBeenCalledTimes(2);
    expect(mockAssetDownloadAsync).toHaveBeenCalledTimes(2);
  });
});

describe("CafePdfViewer WebView lockdown (#219 review, finding 3+4)", () => {
  beforeEach(() => {
    mockWebView.mockClear();
    mockAssetFromModule.mockClear();
    mockAssetDownloadAsync.mockClear();
  });

  it("renders a WebView locked to about:blank -- no wildcard originWhitelist", async () => {
    await renderViewer();
    expect(mockWebView).toHaveBeenCalledTimes(1);
    expect(lastWebViewProps().originWhitelist).toEqual(["about:blank"]);
  });

  it("disables file access and multi-window support", async () => {
    await renderViewer();
    const props = lastWebViewProps();
    expect(props.allowFileAccess).toBe(false);
    expect(props.setSupportMultipleWindows).toBe(false);
  });

  it("the generated viewer HTML references the vendored LOCAL pdf.js bytes (resolved via expo-asset, #325), never cdnjs or any remote host", async () => {
    await renderViewer();
    const html = lastWebViewProps().source.html;
    expect(html).not.toMatch(/cdnjs\.cloudflare\.com/);
    expect(html).not.toMatch(/https?:\/\//); // no remote script/resource url anywhere in the page
    expect(html).toContain(`data:text/javascript;base64,${FAKE_PDFJS_MIN_BASE64}`);
    expect(html).toContain(`data:text/javascript;base64,${FAKE_PDFJS_WORKER_BASE64}`);
  });

  it("passes the downloaded PDF's own bytes through as base64", async () => {
    await renderViewer();
    expect(lastWebViewProps().source.html).toContain('atob("ZmFrZS1wZGYtYnl0ZXM=")');
  });
});

describe("CafePdfViewer error handling (#242)", () => {
  beforeEach(() => {
    mockWebView.mockClear();
    mockDownloadAsync.mockClear();
    mockAssetFromModule.mockClear();
    mockAssetDownloadAsync.mockClear();
  });

  it("renders a visible error state, not the viewer, when the download response is a non-2xx status", async () => {
    mockDownloadAsync.mockResolvedValueOnce({ status: 404 });
    const root = await renderViewer();
    expect(mockWebView).not.toHaveBeenCalled();
    const text = JSON.stringify(root.toJSON());
    expect(text).toContain("HTTP 404");
    expect(text).toContain("RETRY");
  });

  it("surfaces a pdf.js load failure (reported via onMessage) as a visible error state", async () => {
    const root = await renderViewer();
    const { onMessage } = lastWebViewProps() as unknown as { onMessage: (e: { nativeEvent: { data: string } }) => void };
    await act(async () => {
      onMessage({ nativeEvent: { data: JSON.stringify({ type: "pdfjs-error", message: "worker failed to load" }) } });
    });
    const text = JSON.stringify(root.toJSON());
    expect(text).toContain("worker failed to load");
    expect(text).toContain("RETRY");
  });
});

describe("CafePdfViewer has no explanatory caption (CLAUDE.md no-captions rule)", () => {
  it("does not render a gesture-narration/implementation-rationale hint bar", async () => {
    const root = await renderViewer();
    const text = JSON.stringify(root.toJSON());
    // Positive assertion the viewer still renders its real content -- otherwise the two
    // `not.toContain` checks below would pass just as well against a blank tree.
    expect(text).toContain("Baby Berk");
    expect(text).not.toContain("Rendered in-app");
    expect(text).not.toContain("pinch to zoom");
  });
});

// #450 review: removing the hint bar (which had its own large fixed height) exposed that this
// screen's document card never consulted safe-area insets -- a visual-verifier pass found its
// bottom edge landing inside the device's reserved gesture-nav-bar zone. documentSurface's
// marginHorizontal (spacing(3.5) with no inset -- there's no left/right safe-area concern here) is
// unique among this tree's styles, so it doubles as the anchor for finding the surface node itself.
describe("CafePdfViewer document card respects the bottom safe-area inset (#450 review)", () => {
  afterEach(() => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("adds insets.bottom on top of its own base margin, not a flat value that ignores the device", async () => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 0, right: 0, bottom: 34, left: 0 });
    const root = await renderViewer();
    const surface = findByStyleValue(root.toJSON(), "marginHorizontal", spacing(3.5));
    expect(surface).not.toBeNull();
    const flat = StyleSheet.flatten(surface!.props.style as never) as { marginBottom?: number };
    expect(flat.marginBottom).toBe(spacing(3.5) + 34);
  });

  it("falls back to just the base margin when there's no inset to add (e.g. no gesture nav bar)", async () => {
    mockUseSafeAreaInsets.mockReturnValue({ top: 0, right: 0, bottom: 0, left: 0 });
    const root = await renderViewer();
    const surface = findByStyleValue(root.toJSON(), "marginHorizontal", spacing(3.5));
    const flat = StyleSheet.flatten(surface!.props.style as never) as { marginBottom?: number };
    expect(flat.marginBottom).toBe(spacing(3.5));
  });
});

/** DFS-finds the first node whose flattened style has `key === value` -- same pattern as
 * HoldSlideOverlay.test.tsx's own helper. */
function findByStyleValue(node: ReactTestRendererJSON | ReactTestRendererJSON["children"] | null, key: string, value: number): ReactTestRendererJSON | null {
  if (node == null || typeof node === "string") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findByStyleValue(n as ReactTestRendererJSON, key, value);
      if (found) return found;
    }
    return null;
  }
  const flat = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
  if (flat[key] === value) return node;
  return findByStyleValue(node.children, key, value);
}

describe("shouldAllowCafePdfNavigation (#219 review, finding 3)", () => {
  it("allows the WebView's own initial about:blank load", () => {
    expect(shouldAllowCafePdfNavigation(loadRequest("about:blank"))).toBe(true);
  });

  it("rejects a foreign URL -- a link tap or redirect inside the rendered PDF/pdf.js content", () => {
    expect(shouldAllowCafePdfNavigation(loadRequest("https://evil.example/steal"))).toBe(false);
    expect(shouldAllowCafePdfNavigation(loadRequest("https://umassdining.com/menu.pdf"))).toBe(false);
  });
});
