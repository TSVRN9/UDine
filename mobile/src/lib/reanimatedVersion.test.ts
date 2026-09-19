// Guards the react-native-reanimated floor against a downgrade (e.g. `npx expo install --fix`
// pulling it back to SDK 57's bundled 4.5.1). Versions below 4.5.3 ship a settled-props garbage
// collector (FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS, on by default) that evicts a settled
// animated style from the updates registry 2s after it settles, relying on a 500ms JS interval to
// have synced it back into React state during the 1s before that. A JS-thread stall over that
// window skips the sync, and the next React commit re-applies the component's INITIAL animated
// style -- for useDraggableSheet that is opacity 0 / translateY panelTravel, i.e. an open
// PlateSheet vanishes in one frame while still mounted (docs/briefs/stress-fixture-auto-open-
// self-dismiss.md). 4.5.3+ (`collectSettledUpdates`) only evicts an entry on the tick AFTER it
// was handed to React.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require("react-native-reanimated/package.json") as { version: string };

test("react-native-reanimated is at least 4.5.3 (settled-props eviction race fixed upstream)", () => {
  const [major, minor, patch] = version.split(/[.-]/).map(Number);
  const atLeast = major > 4 || (major === 4 && (minor > 5 || (minor === 5 && patch >= 3)));
  expect({ version, atLeast }).toEqual({ version, atLeast: true });
});
