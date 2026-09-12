import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { ShouldStartLoadRequest, WebViewMessageEvent } from "react-native-webview/lib/WebViewTypes";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { loadPdfjsMinJsBase64, loadPdfjsWorkerMinJsBase64 } from "../vendor/pdfjs";

interface Props {
  url: string;
  label: string;
  cafeName: string;
  onClose: () => void;
}

// Android's WebView never routes a subresource script load through onShouldStartLoadWithRequest,
// only top-level navigation, so a CDN-hosted pdf.js couldn't be secured by navigation lockdown
// alone. Vendored as base64 data: URIs instead so rendering a PDF needs no network access at all.
async function buildViewerHtml(base64: string): Promise<string> {
  // Vendored scripts resolve async from expo-asset bundled files (mobile/src/vendor/*.txt).
  const [pdfjsBase64, workerBase64] = await Promise.all([loadPdfjsMinJsBase64(), loadPdfjsWorkerMinJsBase64()]);
  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
<style>body{margin:0;background:${colors.paper50};} canvas{display:block;margin:0 auto 8px auto;}</style>
</head><body>
<div id="pages"></div>
<script src="data:text/javascript;base64,${pdfjsBase64}"></script>
<script>
  pdfjsLib.GlobalWorkerOptions.workerSrc = "data:text/javascript;base64,${workerBase64}";
  var raw = atob("${base64}");
  var bytes = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  pdfjsLib.getDocument({ data: bytes }).promise.then(function(pdf) {
    var container = document.getElementById('pages');
    for (var n = 1; n <= pdf.numPages; n++) {
      (function(pageNum) {
        pdf.getPage(pageNum).then(function(page) {
          var viewport = page.getViewport({ scale: window.devicePixelRatio * (window.innerWidth / page.getViewport({scale:1}).width) });
          var canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = window.innerWidth + 'px';
          container.appendChild(canvas);
          page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport });
        });
      })(n);
    }
  }).catch(function(err) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pdfjs-error', message: String(err && err.message ? err.message : err) }));
  });
</script>
</body></html>`;
}

// source={{html}} with no baseUrl loads at origin "about:blank" -- the only URL this WebView
// should ever navigate to. Exported so tests can pin the predicate without a real WebView.
export function shouldAllowCafePdfNavigation(request: ShouldStartLoadRequest): boolean {
  return request.url === "about:blank";
}

/**
 * In-app PDF viewer for cafés whose standing menu is a PDF link (babyBerk, Commonwealth) instead
 * of an item list. PDF menus render in-app, never bounce to an external viewer/browser.
 *
 * Uses react-native-webview + a vendored pdf.js build fed pre-downloaded bytes -- Android's
 * WebView has no built-in inline PDF viewer, and pdf.js's own hosted viewer used JS syntax too
 * new for this WebView engine.
 */
export function CafePdfViewer({ url, label, cafeName, onClose }: Props) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  // buildViewerHtml is async, so the finished HTML has to live in state rather than being
  // computed inline during render.
  const [viewerHtml, setViewerHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let current = true;
    setError(null);
    setViewerHtml(null);
    setLocalUri(null);
    // ponytail: nothing deletes old cache files across opens; OS reclaims under pressure. Add
    // cleanup (delete on re-open, or a startup sweep) if disk usage becomes a real complaint.
    const dest = `${FileSystem.cacheDirectory}cafe-menu-${Date.now()}.pdf`;
    FileSystem.downloadAsync(url, dest)
      .then((result) => {
        // downloadAsync resolves on a non-2xx response too (error page bytes, not a rejection).
        if (result.status < 200 || result.status >= 300) {
          throw new Error(`menu download failed (HTTP ${result.status})`);
        }
        return FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.Base64 });
      })
      .then((b64) => buildViewerHtml(b64))
      .then((html) => {
        if (!current) return;
        setLocalUri(dest);
        setViewerHtml(html);
      })
      .catch((e) => {
        if (current) setError(String(e instanceof Error ? e.message : e));
      });
    return () => {
      current = false;
    };
  }, [url, retryToken]);

  // pdf.js has no built-in bridge back to React Native; buildViewerHtml's catch posts a message
  // here on render failure.
  function handleWebViewMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data && data.type === "pdfjs-error") {
        setError(typeof data.message === "string" ? data.message : "Couldn't render this PDF.");
      }
    } catch {
      setError("Couldn't render this PDF.");
    }
  }

  function handleRetry() {
    setRetryToken((t) => t + 1);
  }

  async function handleSave() {
    if (!localUri) return;
    // ponytail: no error surfaced if Sharing is unavailable -- only true on web, which this
    // screen never renders on.
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(localUri, { mimeType: "application/pdf", dialogTitle: label });
  }

  return (
    // Native slide, not useSheetAnim -- no backdrop to fade since this is opaque and full-screen.
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {cafeName}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {label} · PDF
            </Text>
          </View>
          <Pressable style={styles.saveButton} onPress={handleSave} disabled={!localUri} accessibilityRole="button" accessibilityLabel="Save PDF">
            <Text style={styles.saveButtonText}>SAVE ⬇</Text>
          </Pressable>
        </View>

        <View style={styles.documentSurface}>
          {error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.error}>Couldn&apos;t load menu: {error}</Text>
              <Pressable onPress={handleRetry} accessibilityRole="button" accessibilityLabel="Retry" style={styles.retryButton}>
                <Text style={styles.retryButtonText}>RETRY</Text>
              </Pressable>
            </View>
          ) : !viewerHtml ? (
            <ActivityIndicator color={colors.gold500} style={styles.loading} />
          ) : (
            <WebView
              source={{ html: viewerHtml }}
              originWhitelist={["about:blank"]}
              onShouldStartLoadWithRequest={shouldAllowCafePdfNavigation}
              onMessage={handleWebViewMessage}
              allowFileAccess={false}
              setSupportMultipleWindows={false}
              style={styles.webview}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.maroon900 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingTop: spacing(4.5), paddingHorizontal: spacing(5), paddingBottom: spacing(3) },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.paper50, marginTop: -4 },
  headerTitleBlock: { flex: 1, gap: 1 },
  headerTitle: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.paper50 },
  headerSubtitle: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.paper50, 55) },
  saveButton: {
    height: fs(32), // matches PlateSheet.tsx's logButton -- same fs()'d control-height convention
    paddingHorizontal: spacing(3),
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: withOpacity(colors.paper50, 30),
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: withOpacity(colors.paper50, 85) },

  // 8px matches CafePdf.dc.html:32 (border-radius: 8px 8px 0 0); doesn't land on an existing radii
  // token. marginBottom (matching marginHorizontal, so the card is inset consistently on every
  // side) replaces the old hintBar as this surface's bottom breathing room now that the hint bar
  // itself is gone -- a flat value, same as the hint bar's own fixed paddingBottom was (neither
  // consults safe-area insets).
  documentSurface: {
    flex: 1,
    marginHorizontal: spacing(3.5),
    marginBottom: spacing(3.5),
    backgroundColor: colors.paper50,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    overflow: "hidden",
  },
  webview: { flex: 1, backgroundColor: colors.paper50 },
  loading: { flex: 1 },
  errorBlock: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing(3), padding: spacing(4) },
  error: { color: "#b00020", fontFamily: fonts.body400, textAlign: "center" },
  retryButton: { paddingVertical: spacing(2), paddingHorizontal: spacing(5), borderRadius: radii.md, borderWidth: 1, borderColor: "#b00020" },
  retryButtonText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: "#b00020" },
});
