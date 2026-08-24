import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  url: string;
  label: string;
  cafeName: string;
  onClose: () => void;
}

// Pinned, not "latest": a spike against mozilla.github.io's own always-current hosted viewer
// (web/viewer.mjs) 500'd on-device with "this[#listeners].getOrInsertComputed is not a function" --
// too-new JS syntax for this WebView's engine. A pinned classic (non-module) build side-steps both
// that and any future breakage from an unpinned dependency.
const PDFJS_VERSION = "3.11.174";

/**
 * pdf.js's own `getDocument(url)` can't be pointed at the PDF url directly from inside the
 * WebView: umassdining.com sends no `Access-Control-Allow-Origin`, and a WebView `source={{html}}`
 * page runs at origin `null`, so the fetch is CORS-blocked (confirmed live via a throwaway spike,
 * logcat: "Access to fetch at '...pdf' from origin 'null' has been blocked by CORS policy"). Fed
 * pre-fetched base64 bytes instead -- the caller downloads via RN's own networking (not subject to
 * WebView-origin CORS at all) and hands pdf.js the bytes directly, no in-WebView fetch involved.
 */
function buildViewerHtml(base64: string): string {
  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
<style>body{margin:0;background:${colors.paper50};} canvas{display:block;margin:0 auto 8px auto;}</style>
</head><body>
<div id="pages"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js"></script>
<script>
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js";
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
  });
</script>
</body></html>`;
}

/**
 * In-app PDF viewer (#177's "Cafe menu - PDF in-app" artboard) -- babyBerk x2 and Commonwealth
 * Restaurant embed a PDF link instead of an item list in their *_menu HTML (CafeSheet.tsx routes
 * here on tap). Owner decision: PDF menus render IN-APP, never bounce to an external
 * viewer/browser -- this screen is the whole reason CafeSheet doesn't just Linking.openURL the
 * link like DIRECTIONS does.
 *
 * Approach picked after a live spike (see this file's buildViewerHtml doc): react-native-webview +
 * a pinned pdf.js build, fed pre-downloaded bytes. Rejected alternatives: pointing the WebView
 * straight at the PDF url (Android's WebView has no built-in inline PDF viewer -- confirmed blank
 * on-device, unlike iOS's WKWebView) and pdf.js's own mozilla.github.io hosted viewer (too-new JS
 * syntax broke on this WebView engine). No native PDF-view dependency needed -- one already-
 * justified WebView dependency, pdf.js loaded from a pinned CDN url at runtime (not vendored),
 * expo-file-system (already a dependency) for the download SAVE also reuses.
 */
export function CafePdfViewer({ url, label, cafeName, onClose }: Props) {
  const [base64, setBase64] = useState<string | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const dest = `${FileSystem.cacheDirectory}cafe-menu-${Date.now()}.pdf`;
    FileSystem.downloadAsync(url, dest)
      .then(() => FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.Base64 }))
      .then((b64) => {
        if (!current) return;
        setLocalUri(dest);
        setBase64(b64);
      })
      .catch((e) => {
        if (current) setError(String(e));
      });
    return () => {
      current = false;
    };
  }, [url]);

  async function handleSave() {
    if (!localUri) return;
    // ponytail: no availability-guard error surfaced to the user beyond the no-op -- Sharing is
    // unavailable only on unsupported platforms (web), which this screen never renders on.
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(localUri, { mimeType: "application/pdf", dialogTitle: label });
  }

  return (
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
          <Text style={styles.error}>Couldn&apos;t load menu: {error}</Text>
        ) : !base64 ? (
          <ActivityIndicator color={colors.gold500} style={styles.loading} />
        ) : (
          <WebView source={{ html: buildViewerHtml(base64) }} originWhitelist={["*"]} style={styles.webview} />
        )}
      </View>

      <View style={styles.hintBar}>
        <Text style={styles.hintText}>Rendered in-app · pinch to zoom · swipe for pages</Text>
      </View>
    </View>
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
    height: 32,
    paddingHorizontal: spacing(3),
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: withOpacity(colors.paper50, 30),
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: withOpacity(colors.paper50, 85) },

  documentSurface: { flex: 1, marginHorizontal: spacing(3.5), backgroundColor: colors.paper50, borderTopLeftRadius: radii.md, borderTopRightRadius: radii.md, overflow: "hidden" },
  webview: { flex: 1, backgroundColor: colors.paper50 },
  loading: { flex: 1 },
  error: { padding: spacing(4), color: "#b00020", fontFamily: fonts.body400 },

  hintBar: { backgroundColor: withOpacity(colors.maroon900, 92), paddingTop: spacing(2.5), paddingHorizontal: spacing(5), paddingBottom: spacing(5), alignItems: "center" },
  hintText: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.paper50, 60) },
});
