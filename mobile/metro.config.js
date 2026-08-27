const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// #325: `.txt` is how the vendored pdf.js/pdf.worker files (mobile/src/vendor/*.txt) are shipped
// as expo-asset bundled assets instead of base64 JS string constants -- Metro treats any
// resolver.assetExts extension as an opaque binary asset (copied into the app binary, not parsed
// as a JS module), which is what lets `Asset.fromModule(require("./pdf.min.js.txt"))` resolve to
// an asset id rather than Metro trying to execute the minified pdf.js source as this file's own
// module. Mirror this list in jest.config.js's `transform` -- jest-expo's own asset transform only
// covers its hardcoded default extension list, not this project-specific one.
config.resolver.assetExts.push("txt");

module.exports = config;
