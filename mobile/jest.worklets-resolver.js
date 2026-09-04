const path = require("path");

// react-native-worklets ships its own jest resolver (react-native-worklets/jest/resolver.js) that
// steers imports of its own `.native.ts` files away from that extension under jest (those touch a
// TurboModule that doesn't exist in this environment). Its own guard is:
//
//   options.basedir.includes('react-native-worklets') || request.includes('react-native-worklets')
//
// That plain substring check is a false-positive footgun under pnpm's isolated node_modules layout:
// pnpm encodes every package's PEER dependencies into its own virtual-store directory name, so e.g.
// expo-modules-core's resolved path here is
// `.pnpm/expo-modules-core@57.0.11_react-native-worklets@0.10.4_.../node_modules/expo-modules-core`
// -- the substring "react-native-worklets" shows up in expo-modules-core's OWN basedir purely
// because worklets is one of ITS peers, with zero relation to worklets' own `.native` files. That
// tripped the upstream guard for expo-modules-core's unrelated internal resolution (confirmed by
// bisecting: removing this file made expo-linear-gradient's NativeViewManagerAdapter throw
// "requireNativeViewManager is not available on ios" under jest, which the upstream resolver
// checked in isolation reproduces and dropping it fixes) -- expo-modules-core resolved a different
// file than jest-expo's own native-view-manager mocking expects, once the "native" extension got
// filtered out of ITS resolution too. Requiring an actual `node_modules/react-native-worklets/`
// path SEGMENT (not just the raw substring) is what the upstream check almost certainly means, and
// keeps this to worklets' own files only.
module.exports = (request, options) => {
  const { defaultResolver } = options;
  const workletsSegment = `${path.sep}node_modules${path.sep}react-native-worklets${path.sep}`;
  if (options.basedir.includes(workletsSegment) || request === "react-native-worklets" || request.startsWith("react-native-worklets/")) {
    const workletOptions = { ...options };
    workletOptions.extensions = workletOptions.extensions?.filter((ext) => !ext.includes("native"));
    options = workletOptions;
  }
  return defaultResolver(request, options);
};
