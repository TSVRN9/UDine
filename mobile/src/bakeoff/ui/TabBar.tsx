import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { Text } from "./Text";

const ICON: Record<string, React.ReactNode> = {
  index: <><Path d="M3 10l9-6 9 6" /><Path d="M5 10v9M19 10v9M9.5 19v-6h5v6M3 19.5h18" /></>,
  search: <><Circle cx={10.5} cy={10.5} r={6.5} /><Path d="M20 20l-4.8-4.8" /></>,
  you: <><Circle cx={12} cy={8} r={4} /><Path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
};
const LABEL: Record<string, string> = { index: "Halls", search: "Search", you: "You" };
export const DISABLED_TABS = ["search"];

/** M2 `.tbar`: white bar, hairline top, Halls / Search / You. A disabled tab is dimmed and inert. */
export function TabBar({ state, navigation, bottomInset = 0 }: {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
  bottomInset?: number;
}) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: m2.color.white, borderTopWidth: 1, borderTopColor: m2.color.hair, paddingBottom: bottomInset }}>
      {state.routes.map((r, i) => {
        const selected = state.index === i;
        const disabled = DISABLED_TABS.includes(r.name);
        const color = selected ? m2.color.vm : m2.color.slate;
        return (
          <Press key={r.key} accessibilityRole="tab" accessibilityLabel={LABEL[r.name]}
            accessibilityState={{ selected, disabled }} disabled={disabled}
            onPress={() => { if (!selected) navigation.navigate(r.name); }}
            style={{ flex: 1, height: m2.size.tabBar, alignItems: "center", justifyContent: "center", gap: 3, opacity: disabled ? 0.4 : 1 }}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{ICON[r.name]}</Svg>
            <Text v="tabBar" color={color}>{LABEL[r.name]}</Text>
          </Press>
        );
      })}
    </View>
  );
}
