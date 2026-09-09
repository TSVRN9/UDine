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

/**
 * PR #219 review, finding 3: this used to `<script src="https://cdnjs.../pdf.min.js">` at render
 * time -- version-pinned, but with no subresource integrity, into a WebView with
 * `originWhitelist={["*"]}` and no navigation lockdown. Two problems, one fix: (1) a supply-chain
 * gap -- cdnjs (or anything on the path to it) could swap the bytes under that exact pinned URL and
 * nothing here would notice; (2) Android's WebView never routes a subresource load (a `<script
 * src>` fetch, as opposed to a top-level navigation) through `onShouldStartLoadWithRequest` at all,
 * so no amount of navigation-level lockdown could have caught a compromised script either way --
 * blocking navigation while the script itself still arrives over the network is self-defeating.
 * Vendoring (`../vendor/pdfjs.ts`) removes the network fetch entirely rather than trying to police
 * it: both scripts ship as base64 `data:` URIs sourced from the app's own bundle, so nothing here
 * ever leaves the device to render a PDF, online or offline (this also fixes the screen silently
 * failing offline despite the PDF bytes already being on disk -- there was never a good reason for
 * an in-app PDF render to need network access beyond the initial PDF download itself).
 */
async function buildViewerHtml(base64: string): Promise<string> {
  // #325: the two vendored scripts now ship as expo-asset bundled assets (mobile/src/vendor/*.txt)
  // instead of base64 JS string constants, so resolving them to bytes is async -- see
  // ../vendor/pdfjs.ts's doc comment for why (OTA payload size, not correctness; #226 already
  // confirmed the viewer itself renders/scrolls/pinch-zooms correctly on-device).
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

/**
 * PR #219 review, finding 3: locks the WebView to exactly its own initial `source={{html}}` load
 * and nothing else -- no link tap, redirect, or `window.open` inside the vendored pdf.js/PDF
 * content should ever navigate this WebView anywhere. `about:blank` is the origin
 * `source={{html}}` loads at with no `baseUrl` set (confirmed live -- see buildViewerHtml's own
 * doc on the CORS spike, logcat reported this exact page as origin `null`/`about:blank`), so it's
 * also the only entry `originWhitelist` needs. Exported so a test can pin the predicate directly
 * (a foreign URL -> false, the initial load's own URL -> true) without needing a real WebView.
 */
export function shouldAllowCafePdfNavigation(request: ShouldStartLoadRequest): boolean {
  return request.url === "about:blank";
}

/**
 * In-app PDF viewer (#177's "Cafe menu - PDF in-app" artboard) -- babyBerk x2 and Commonwealth
 * Restaurant embed a PDF link instead of an item list in their *_menu HTML (CafeSheet.tsx routes
 * here on tap). Owner decision: PDF menus render IN-APP, never bounce to an external
 * viewer/browser -- this screen is the whole reason CafeSheet doesn't just Linking.openURL the
 * link like DIRECTIONS does.
 *
 * Approach picked after a live spike (see this file's buildViewerHtml doc): react-native-webview +
 * a pinned, vendored pdf.js build (`../vendor/pdfjs.ts`), fed pre-downloaded bytes. Rejected
 * alternatives: pointing the WebView straight at the PDF url (Android's WebView has no built-in
 * inline PDF viewer -- confirmed blank on-device, unlike iOS's WKWebView) and pdf.js's own
 * mozilla.github.io hosted viewer (too-new JS syntax broke on this WebView engine). No native
 * PDF-view dependency needed -- one already-justified WebView dependency, pdf.js vendored as a
 * local asset (PR #219 review, finding 3 -- was a pinned CDN url at runtime, no subresource
 * integrity), expo-file-system (already a dependency) for the download SAVE also reuses.
 */
export function CafePdfViewer({ url, label, cafeName, onClose }: Props) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  // #325: buildViewerHtml is now async (it resolves the two vendored pdf.js scripts from
  // expo-asset bundled assets rather than reading hardcoded JS string constants), so the finished
  // HTML has to live in state -- JSX render can't await it inline the way it could call the old
  // synchronous buildViewerHtml(base64) directly.
  const [viewerHtml, setViewerHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let current = true;
    setError(null);
    setViewerHtml(null);
    setLocalUri(null);
    // ponytail: each open writes a new timestamped file under cacheDirectory and nothing ever
    // deletes it -- the OS is free to reclaim cache space under pressure, but a heavy user
    // (several different PDF menus opened over time) accumulates dead files until then. Add
    // cleanup (delete the previous dest on unmount/re-open, or a startup sweep of cafe-menu-*.pdf)
    // if this shows up as real disk-usage complaints; low blast radius until then (cache dir, not
    // persistent storage).
    const dest = `${FileSystem.cacheDirectory}cafe-menu-${Date.now()}.pdf`;
    FileSystem.downloadAsync(url, dest)
      .then((result) => {
        // #242: downloadAsync resolves on a non-2xx response too (an HTTP error page's bytes,
        // not a rejection) -- without this check those bytes get handed to pdf.js as if they
        // were a real PDF instead of surfacing as an error.
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

  // #242: pdf.js's getDocument().promise had no .catch and no bridge back to React Native, so a
  // rejection (bad bytes, worker load failure) left the user on a permanently blank viewer with
  // the "Rendered in-app" hint still showing underneath. buildViewerHtml's catch now posts a
  // message here instead.
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
    // ponytail: no availability-guard error surfaced to the user beyond the no-op -- Sharing is
    // unavailable only on unsupported platforms (web), which this screen never renders on.
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(localUri, { mimeType: "application/pdf", dialogTitle: label });
  }

  return (
    // Animation-consistency fix: this used to be a bare conditionally-mounted View -- every other
    // full-screen/sheet overlay in the app (NutritionLabel's slide-up Modal, CafeSheet/
    // HallInfoSheet/PlateSheet's useSheetAnim fade+translate) animates in, but this one popped
    // into existence instantly. Same full-screen-page treatment as NutritionLabel (RN's own native
    // slide, not useSheetAnim -- there's no backdrop to fade since this is opaque and covers the
    // whole screen, same reasoning as that file's own doc comment).
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

        <View style={styles.hintBar}>
          {/* PR #219 review: pages render stacked in one vertical scroll (buildViewerHtml appends
          each page's <canvas> into the same #pages container), not a swipeable pager -- "scroll",
          not the styling spec's verbatim "swipe", is what this screen actually does. */}
          <Text style={styles.hintText}>Rendered in-app · pinch to zoom · scroll for pages</Text>
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

  // 8px matches CafePdf.dc.html:32 (border-radius: 8px 8px 0 0); doesn't land on an existing radii token.
  documentSurface: { flex: 1, marginHorizontal: spacing(3.5), backgroundColor: colors.paper50, borderTopLeftRadius: 8, borderTopRightRadius: 8, overflow: "hidden" },
  webview: { flex: 1, backgroundColor: colors.paper50 },
  loading: { flex: 1 },
  errorBlock: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing(3), padding: spacing(4) },
  error: { color: "#b00020", fontFamily: fonts.body400, textAlign: "center" },
  retryButton: { paddingVertical: spacing(2), paddingHorizontal: spacing(5), borderRadius: radii.md, borderWidth: 1, borderColor: "#b00020" },
  retryButtonText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: "#b00020" },

  hintBar: { backgroundColor: withOpacity(colors.maroon900, 92), paddingTop: spacing(2.5), paddingHorizontal: spacing(5), paddingBottom: spacing(5), alignItems: "center" },
  hintText: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.paper50, 60) },
});
