// react-native-reanimated's own jest mock, plus the hooks it leaves out ("ADD ME IF NEEDED" in its mock.ts) that the bake-off kit reads.
module.exports = { ...require("react-native-reanimated/mock"), useReducedMotion: () => false };
