// CafePdfViewer had ZERO tests (PR #219 review, finding 4) despite being the one screen that loads
// third-party PDF bytes into a WebView -- exactly the surface finding 3's lockdown (vendored pdf.js,
// no CDN script src, originWhitelist/onShouldStartLoadWithRequest/allowFileAccess/
// setSupportMultipleWindows) protects. This pins those security-critical props directly, plus that
// the generated viewer HTML references the vendored LOCAL asset, never a remote host.

// WebView needs a native module not present under jest. Mocked as a jest.fn (not `() => null`) so
// this file can inspect exactly what props it was rendered with -- the point of this test.
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

const mockDownloadAsync = jest.fn().mockResolvedValue(undefined);
const mockReadAsStringAsync = jest.fn().mockResolvedValue("ZmFrZS1wZGYtYnl0ZXM="); // base64("fake-pdf-bytes")
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  downloadAsync: (...args: unknown[]) => mockDownloadAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  EncodingType: { Base64: "base64" },
}));

import renderer, { act } from "react-test-renderer";
import { CafePdfViewer, shouldAllowCafePdfNavigation } from "./CafePdfViewer";
import { PDFJS_MIN_JS_BASE64, PDFJS_WORKER_MIN_JS_BASE64 } from "../vendor/pdfjs";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";

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

describe("CafePdfViewer WebView lockdown (#219 review, finding 3+4)", () => {
  beforeEach(() => {
    mockWebView.mockClear();
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

  it("the generated viewer HTML references the vendored LOCAL pdf.js bytes, never cdnjs or any remote host", async () => {
    await renderViewer();
    const html = lastWebViewProps().source.html;
    expect(html).not.toMatch(/cdnjs\.cloudflare\.com/);
    expect(html).not.toMatch(/https?:\/\//); // no remote script/resource url anywhere in the page
    expect(html).toContain(`data:text/javascript;base64,${PDFJS_MIN_JS_BASE64}`);
    expect(html).toContain(`data:text/javascript;base64,${PDFJS_WORKER_MIN_JS_BASE64}`);
  });

  it("passes the downloaded PDF's own bytes through as base64", async () => {
    await renderViewer();
    expect(lastWebViewProps().source.html).toContain('atob("ZmFrZS1wZGYtYnl0ZXM=")');
  });
});

describe("shouldAllowCafePdfNavigation (#219 review, finding 3)", () => {
  it("allows the WebView's own initial about:blank load", () => {
    expect(shouldAllowCafePdfNavigation(loadRequest("about:blank"))).toBe(true);
  });

  it("rejects a foreign URL -- a link tap or redirect inside the rendered PDF/pdf.js content", () => {
    expect(shouldAllowCafePdfNavigation(loadRequest("https://evil.example/steal"))).toBe(false);
    expect(shouldAllowCafePdfNavigation(loadRequest("https://umassdining.com/menu.pdf"))).toBe(false);
  });
});
