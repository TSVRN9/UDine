// #325: `.txt` isn't one of Metro's built-in asset extensions (see `../../metro.config.js`), so
// TypeScript has no ambient type for it the way it does for `*.png` etc. This is what lets
// `pdfjs.ts` `import pdfjsMinJsAsset from "./pdf.min.js.txt"` typecheck -- resolves to the same
// numeric asset-module id `Asset.fromModule` expects for any other bundled asset.
declare module "*.txt" {
  const assetId: number;
  export default assetId;
}
