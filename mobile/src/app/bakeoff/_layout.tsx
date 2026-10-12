import { Tabs } from "expo-router/js-tabs";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { TabBar } from "../../bakeoff/ui";

// dev only: the root layout's background-task registration warns on every cold start, and its toast covers the tab bar in screenshots
if (__DEV__) LogBox.ignoreLogs(["No task registered for key"]);

export default function BakeoffLayout() {
  const { bottom } = useSafeAreaInsets();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <Tabs
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: m2.color.chalk } }}
          tabBar={(p) => <TabBar state={p.state} navigation={p.navigation} bottomInset={Math.max(10, bottom)} />}
        >
          <Tabs.Screen name="index" />
          <Tabs.Screen name="search" />
          <Tabs.Screen name="you" />
        </Tabs>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
