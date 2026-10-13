import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { ALLERGENS } from "../logic/menuView";
import { Text } from "../ui";
import { setPrefs, useStore } from "../state/store";
import { CheckRow } from "./CheckRow";

const DIET = [["veg", "Vegetarian"], ["plant", "Plant based"], ["halal", "Halal"]] as const;

/** M2's Dietary preferences page: "Only show" (the diet marks), then "Avoid" (the Big 9, then gluten and corn, in `ALLERGENS`' order). */
export function DietPrefs() {
  const prefs = useStore((s) => s.prefs);
  const head = (t: string, first?: boolean) => <Text v="section" color={m2.color.dm} accessibilityRole="header" style={{ marginTop: first ? m2.space.h3Top : m2.space.dietGroupTop, marginBottom: m2.space.line }}>{t}</Text>;
  return (
    <View>
      {head("Only show", true)}
      {DIET.map(([k, label]) => <CheckRow key={k} label={label} on={prefs[k]} onToggle={() => setPrefs({ [k]: !prefs[k] })} />)}
      {head("Avoid")}
      {ALLERGENS.map((a, i) => (
        <CheckRow key={a} label={a} on={prefs.avoid.includes(a)} last={i === ALLERGENS.length - 1}
          onToggle={() => setPrefs({ avoid: prefs.avoid.includes(a) ? prefs.avoid.filter((x) => x !== a) : ALLERGENS.filter((x) => x === a || prefs.avoid.includes(x)) })} />
      ))}
    </View>
  );
}
