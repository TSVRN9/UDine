// react-native-reanimated's own jest mock, plus what it leaves out ("ADD ME IF NEEDED" in its mock.ts) that the bake-off kit reads:
// useReducedMotion, and a shared value that keeps its identity across renders as a real one does (the mock's makes a fresh one every render).
const React = require("react");
const mock = require("react-native-reanimated/mock");
module.exports = {
  ...mock,
  useReducedMotion: () => false,
  useSharedValue: (init) => {
    const ref = React.useRef(null);
    if (ref.current === null) ref.current = mock.useSharedValue(init);
    return ref.current;
  },
};
