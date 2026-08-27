/**
 * Vendored pdf.js build, PINNED at v3.11.174 -- do not bump casually.
 *
 * Provenance: downloaded verbatim from
 *   https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
 *   https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js
 * on 2026-08-25, saved byte-for-byte as `pdf.min.js.txt` / `pdf.worker.min.js.txt` in this
 * directory -- no network fetch, no file:// access, nothing for onShouldStartLoadWithRequest to
 * police (Android subresource loads -- including a `<script src>` -- don't route through that
 * callback at all, which is exactly why a CDN `<script src>` was a real supply-chain gap: cdnjs,
 * or anything on the path to it, could swap the bytes under an unpinned or even a version-pinned
 * URL, and no in-app check would catch it. Vendoring removes the network fetch entirely, not just
 * the trust in it.
 *
 * Version pinned per CafePdfViewer.tsx's own doc comment: a spike against pdf.js's always-current
 * hosted viewer 500'd on-device with "this[#listeners].getOrInsertComputed is not a function" --
 * too-new JS syntax for this WebView's engine. 3.11.174 is confirmed working there; do not bump
 * without re-spiking on-device first.
 *
 * #325: the two files used to live here as base64 JS string constants (`PDFJS_MIN_JS_BASE64` /
 * `PDFJS_WORKER_MIN_JS_BASE64`), which meant every EAS Update OTA payload re-shipped this ~1.4MB
 * blob to every installed user even when the update never touched PDF viewing. They're now
 * `.txt`-suffixed `expo-asset` bundled assets instead (`.txt` so Metro's resolver treats them as
 * opaque assets rather than trying to parse them as JS modules -- registered in
 * `mobile/metro.config.js`'s `resolver.assetExts` for the real bundler and in
 * `mobile/jest.config.js`'s `transform` for tests; see `mobile/src/vendor/asset-modules.d.ts` for
 * the ambient `*.txt` module type). Metro still packages them into the app binary (nothing here
 * changes offline behavior or #219's no-CDN guarantee), but a hashed asset only re-transfers over
 * OTA when its own bytes change, not on every unrelated update.
 *
 * To update: download both files fresh from the URLs above (or a newer pinned version once
 * re-verified on-device) and overwrite `pdf.min.js.txt` / `pdf.worker.min.js.txt` directly --
 * no encoding step, they're byte-identical to the upstream download (verify with `sha256sum`).
 * Apache-2.0, (c) Mozilla Foundation -- license notice is preserved verbatim inside both files
 * (each opens with its own @licstart/@licend banner).
 */
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import pdfjsMinJsAsset from "./pdf.min.js.txt";
import pdfjsWorkerMinJsAsset from "./pdf.worker.min.js.txt";

export const PDFJS_VERSION = "3.11.174";

/**
 * Resolves one bundled `.txt` asset to its base64 bytes. No memoization here on purpose: caching
 * the promise would also cache a transient `downloadAsync` failure forever, defeating
 * CafePdfViewer's RETRY button (#242). `Asset#downloadAsync` is itself idempotent (a no-op once
 * `localUri` is already set), so repeat calls after the first successful resolve are already cheap.
 */
async function loadBundledAssetAsBase64(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error("pdf.js bundled asset resolved with no localUri");
  return FileSystem.readAsStringAsync(asset.localUri, { encoding: FileSystem.EncodingType.Base64 });
}

export function loadPdfjsMinJsBase64(): Promise<string> {
  return loadBundledAssetAsBase64(pdfjsMinJsAsset);
}

export function loadPdfjsWorkerMinJsBase64(): Promise<string> {
  return loadBundledAssetAsBase64(pdfjsWorkerMinJsAsset);
}
