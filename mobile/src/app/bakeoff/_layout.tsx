import { Tabs } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { TabBar } from "../../bakeoff/ui";

export default function BakeoffLayout() {
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: m2.color.chalk } }}
      tabBar={(p) => <TabBar state={p.state} navigation={p.navigation} bottomInset={Math.max(10, bottom)} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}
