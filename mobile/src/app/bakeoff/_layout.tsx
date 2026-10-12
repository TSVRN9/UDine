import { useEffect, useLayoutEffect } from "react";
import { useGlobalSearchParams } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { TabBar } from "../../bakeoff/ui";
import { sbOf } from "../../bakeoff/ui/inset";
import { DishSheetHost } from "../../bakeoff/screens/DishSheet";
import { PlateSheet } from "../../bakeoff/screens/PlateSheet";
import { ensureNet } from "../../bakeoff/state/net";
import { parseNet } from "../../bakeoff/logic/net";
import { applyDevParams, hydrate } from "../../bakeoff/state/store";

// dev only: the root layout's background-task registration warns on every cold start, and its toast covers the tab bar in screenshots
if (__DEV__) LogBox.ignoreLogs(["No task registered for key"]);

export default function BakeoffLayout() {
  const { bottom } = useSafeAreaInsets();
  const inset = sbOf(bottom);
  // dev only (screenshots): the route's query seeds the store (`state/store.ts` applyDevParams), on whichever tab the link opens
  const q = useGlobalSearchParams();
  const query = JSON.stringify(q);
  // the network mode: EXPO_PUBLIC_BAKEOFF_NET at launch, and in a dev build a `net=slow|offline|fail|ok` param (before paint, so no frame shows the other mode)
  const net = parseNet(__DEV__ && typeof q.net === "string" ? q.net : process.env.EXPO_PUBLIC_BAKEOFF_NET);
  const hold = __DEV__ && q.hold === "1";
  useLayoutEffect(() => { ensureNet(net, hold); }, [net, hold]);
  useEffect(() => { hydrate().then(() => applyDevParams(JSON.parse(query))); }, [query]);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <Tabs
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: m2.color.chalk } }}
          tabBar={(p) => <TabBar state={p.state} navigation={p.navigation} bottomInset={inset} />}
        >
          <Tabs.Screen name="index" />
          <Tabs.Screen name="search" />
          <Tabs.Screen name="you" />
        </Tabs>
        <PlateSheet tabH={m2.size.tabBar + 1 + inset} />
        <DishSheetHost />
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
