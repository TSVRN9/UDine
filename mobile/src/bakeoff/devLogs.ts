import { LogBox } from "react-native";

// dev only: the toasts for these warnings cover the tab bar in screenshots. Imported first by the root layout, because Reanimated warns
// about reduced motion when it loads, before any bake-off screen's module has run.
if (__DEV__) LogBox.ignoreLogs(["No task registered for key", "[Reanimated] Reduced motion setting is enabled"]);
