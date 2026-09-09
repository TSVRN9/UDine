import type { CustomFood, CustomFoodsStorage } from "@udine/shared";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildCustomFood, type CustomFoodFormInput } from "../lib/customFoodForm";
import { Button } from "./ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  visible: boolean;
  /** Prefills the name field with whatever was typed in PlateSheet's search box when the standing
   * "Can't find it? Create a custom food" row was tapped -- see PlateSheet.tsx's own doc on that
   * row. Undefined when opened with nothing typed. */
  initialName?: string;
  customFoodsStorage: CustomFoodsStorage;
  onSaved: (food: CustomFood) => void;
  onClose: () => void;
}

const BLANK: CustomFoodFormInput = {
  name: "",
  servingSize: "",
  calories: "",
  proteinG: "",
  totalCarbG: "",
  totalFatG: "",
  caloriesFromFat: "",
  satFatG: "",
  transFatG: "",
  cholesterolMg: "",
  sodiumMg: "",
  dietaryFiberG: "",
  sugarsG: "",
  ingredients: "",
};

/**
 * Manual custom-food entry (#91 follow-on, greenfield -- no database will ever have a homemade
 * recipe or a friend's cooking). Device-local only, always: saved straight to
 * CustomFoodsStorage/custom_foods, never touches Supabase, same residency posture as
 * CustomFood's own doc comment. Core 4 macros (calories/protein/carbs/fat) required up front;
 * everything else NutritionFacts has lives behind "More nutrition fields" so a quick entry isn't
 * blocked on fiber/sugar/sodium/etc. Same RN <Modal> structural call as NutritionLabel/PlateSheet
 * (see halls/[slug].tsx's own note) -- rendered as a sibling, not nested inside PlateSheet's Modal.
 */
export function CustomFoodForm({ visible, initialName, customFoodsStorage, onSaved, onClose }: Props) {
  const [fields, setFields] = useState<CustomFoodFormInput>(BLANK);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  // Reseed on every open (not just mount) -- matches PlateSheet's own close-effect reset
  // convention: a form left open across an unrelated re-render shouldn't retain a previous
  // attempt's half-typed values, and initialName can differ each time this opens.
  useEffect(() => {
    if (visible) {
      setFields({ ...BLANK, name: initialName ?? "" });
      setShowMore(false);
      setError(null);
    }
  }, [visible, initialName]);

  function set<K extends keyof CustomFoodFormInput>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const food = buildCustomFood(fields, id);
    if (!food) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      await customFoodsStorage.addCustomFood(food);
      onSaved(food);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing(4.5) }]}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <Text style={styles.title}>Create a Custom Food</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Field label="Name" value={fields.name} onChangeText={(v) => set("name", v)} placeholder="e.g. Grandma's Lasagna" />
          <Field label="Serving size" value={fields.servingSize} onChangeText={(v) => set("servingSize", v)} placeholder="e.g. 1 slice" />

          <View style={styles.row}>
            <Field label="Calories" value={fields.calories} onChangeText={(v) => set("calories", v)} keyboardType="decimal-pad" style={styles.rowField} />
            <Field label="Protein (g)" value={fields.proteinG} onChangeText={(v) => set("proteinG", v)} keyboardType="decimal-pad" style={styles.rowField} />
          </View>
          <View style={styles.row}>
            <Field label="Carbs (g)" value={fields.totalCarbG} onChangeText={(v) => set("totalCarbG", v)} keyboardType="decimal-pad" style={styles.rowField} />
            <Field label="Fat (g)" value={fields.totalFatG} onChangeText={(v) => set("totalFatG", v)} keyboardType="decimal-pad" style={styles.rowField} />
          </View>

          <Pressable onPress={() => setShowMore((s) => !s)} accessibilityRole="button" style={styles.moreToggle}>
            <Text style={styles.moreToggleText}>{showMore ? "Hide" : "More"} nutrition fields</Text>
          </Pressable>

          {showMore && (
            <View style={styles.moreFields}>
              <View style={styles.row}>
                <Field label="Sat. fat (g)" value={fields.satFatG ?? ""} onChangeText={(v) => set("satFatG", v)} keyboardType="decimal-pad" style={styles.rowField} />
                <Field label="Trans fat (g)" value={fields.transFatG ?? ""} onChangeText={(v) => set("transFatG", v)} keyboardType="decimal-pad" style={styles.rowField} />
              </View>
              <View style={styles.row}>
                <Field label="Cholesterol (mg)" value={fields.cholesterolMg ?? ""} onChangeText={(v) => set("cholesterolMg", v)} keyboardType="decimal-pad" style={styles.rowField} />
                <Field label="Sodium (mg)" value={fields.sodiumMg ?? ""} onChangeText={(v) => set("sodiumMg", v)} keyboardType="decimal-pad" style={styles.rowField} />
              </View>
              <View style={styles.row}>
                <Field label="Fiber (g)" value={fields.dietaryFiberG ?? ""} onChangeText={(v) => set("dietaryFiberG", v)} keyboardType="decimal-pad" style={styles.rowField} />
                <Field label="Sugars (g)" value={fields.sugarsG ?? ""} onChangeText={(v) => set("sugarsG", v)} keyboardType="decimal-pad" style={styles.rowField} />
              </View>
              <Field label="Calories from fat" value={fields.caloriesFromFat ?? ""} onChangeText={(v) => set("caloriesFromFat", v)} keyboardType="decimal-pad" />
              <Field label="Ingredients" value={fields.ingredients ?? ""} onChangeText={(v) => set("ingredients", v)} placeholder="Optional" multiline />
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: spacing(3) + insets.bottom }]}>
          <Button variant="primary" style={styles.saveButton} onPress={handleSave} disabled={saving || !fields.name.trim()}>
            {saving ? "Saving…" : "Save custom food"}
          </Button>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "decimal-pad";
  multiline?: boolean;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={withOpacity(colors.ink900, 45)}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingHorizontal: spacing(5), paddingBottom: spacing(3) },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  title: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900, flex: 1 },

  body: { paddingHorizontal: spacing(5), paddingBottom: spacing(6), gap: spacing(3) },
  row: { flexDirection: "row", gap: spacing(3) },
  rowField: { flex: 1 },

  field: { gap: spacing(1) },
  fieldLabel: { fontFamily: fonts.body600, fontSize: fs(12), color: withOpacity(colors.ink900, 65) },
  fieldInput: {
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 25),
    borderRadius: radii.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    fontFamily: fonts.body400,
    color: colors.ink900,
  },
  fieldInputMultiline: { minHeight: fs(72), textAlignVertical: "top" },

  moreToggle: { paddingVertical: spacing(1) },
  moreToggleText: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon600 },
  moreFields: { gap: spacing(3) },

  error: { fontFamily: fonts.body400, fontSize: fs(13), color: "#b00020" },

  footer: { backgroundColor: colors.paper50, borderTopWidth: 1, borderColor: withOpacity(colors.ink900, 12), paddingHorizontal: spacing(5), paddingTop: spacing(3) },
  saveButton: { height: fs(48), borderRadius: radii.md },
});
